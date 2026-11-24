-- 076: Google-Forms-style sign-up questions for events, with an optional
-- hand-drawn parent signature at the end.
--
-- events.form: [{ id, type, label, help, required, per_child, options[] }]
--   type: short | paragraph | choice | checkboxes | dropdown | date
-- Answers: { <question id>: value } — for per_child questions
--   { <question id>: { <student id>: value } }. Checkbox values are arrays.

alter table events
  add column if not exists form jsonb not null default '[]'::jsonb,
  add column if not exists signature_required boolean not null default false,
  add column if not exists signature_text text;

create table if not exists event_responses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  invoice_id uuid references invoices(id) on delete set null,
  student_ids uuid[] not null default '{}',
  answers jsonb not null default '{}'::jsonb,
  signer_name text,
  signature_data text,          -- data:image/png;base64,…
  signed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists event_responses_event_idx on event_responses(event_id);
alter table event_responses enable row level security;
create policy "event_responses admin" on event_responses for all using (is_admin()) with check (is_admin());
create policy "event_responses parent read" on event_responses for select using (customer_id is not null and customer_id = my_customer_id());

-- Is an answer filled in? (text / date: non-blank; checkboxes: non-empty array)
create or replace function form_value_filled(v jsonb) returns boolean language sql immutable as $$
  select case jsonb_typeof(v)
    when 'string' then btrim(v #>> '{}') <> ''
    when 'array' then jsonb_array_length(v) > 0
    when 'number' then true
    else false end
$$;

-- Sign up with the event's form (and signature when required), then do the
-- usual sign-up + invoice through event_register. Parents must fill the form
-- when they sign up new children; adding guests later doesn't ask again.
create or replace function event_register_form(
  p_event uuid, p_students uuid[], p_note text default null, p_guests text[] default null,
  p_answers jsonb default '{}'::jsonb, p_signer text default null, p_signature text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e events;
  fam uuid := my_customer_id();
  is_adm boolean := is_admin();
  new_ids uuid[];
  q jsonb;
  v jsonb;
  sid uuid;
  sname text;
  res jsonb;
  resp_id uuid;
  ans jsonb := coalesce(p_answers, '{}'::jsonb);
  opts jsonb;
  x jsonb;
begin
  select * into e from events where id = p_event;
  if not found or e.archived then raise exception 'This event is not available.'; end if;
  if jsonb_typeof(ans) <> 'object' then raise exception 'Bad answers.'; end if;
  if length(ans::text) > 50000 then raise exception 'Answers are too long.'; end if;
  p_students := coalesce(p_students, '{}'::uuid[]);
  select coalesce(array_agg(x2), '{}'::uuid[]) into new_ids from unnest(p_students) x2
  where not exists (select 1 from event_signups es where es.event_id = p_event and es.student_id = x2 and es.status = 'signed_up');

  -- the form is required for parents signing up new children
  if not is_adm and cardinality(new_ids) > 0 then
    for q in select * from jsonb_array_elements(coalesce(e.form, '[]'::jsonb)) loop
      opts := coalesce(q->'options', '[]'::jsonb);
      if coalesce((q->>'per_child')::boolean, false) then
        foreach sid in array new_ids loop
          v := ans #> array[q->>'id', sid::text];
          if coalesce((q->>'required')::boolean, false) and (v is null or not form_value_filled(v)) then
            select split_part(name, ' ', 1) into sname from students where id = sid;
            raise exception 'Please answer "%" for %.', q->>'label', sname;
          end if;
          if v is not null and q->>'type' in ('choice', 'dropdown') and form_value_filled(v) and not opts ? (v #>> '{}') then raise exception 'Please choose one of the options for "%".', q->>'label'; end if;
          if v is not null and q->>'type' = 'checkboxes' and jsonb_typeof(v) = 'array' then
            for x in select * from jsonb_array_elements(v) loop
              if not opts ? (x #>> '{}') then raise exception 'Please choose from the options for "%".', q->>'label'; end if;
            end loop;
          end if;
        end loop;
      else
        v := ans -> (q->>'id');
        if coalesce((q->>'required')::boolean, false) and (v is null or not form_value_filled(v)) then
          raise exception 'Please answer "%".', q->>'label';
        end if;
        if v is not null and q->>'type' in ('choice', 'dropdown') and form_value_filled(v) and not opts ? (v #>> '{}') then raise exception 'Please choose one of the options for "%".', q->>'label'; end if;
        if v is not null and q->>'type' = 'checkboxes' and jsonb_typeof(v) = 'array' then
          for x in select * from jsonb_array_elements(v) loop
            if not opts ? (x #>> '{}') then raise exception 'Please choose from the options for "%".', q->>'label'; end if;
          end loop;
        end if;
      end if;
    end loop;
    if e.signature_required then
      if nullif(btrim(coalesce(p_signer, '')), '') is null then raise exception 'Please type your name under the signature.'; end if;
      if p_signature is null or p_signature not like 'data:image/png;base64,%' or length(p_signature) < 1500 then raise exception 'Please sign in the signature box.'; end if;
      if length(p_signature) > 400000 then raise exception 'The signature image is too large — please clear it and sign again.'; end if;
    end if;
  end if;

  res := event_register(p_event, p_students, p_note, p_guests, null);

  if cardinality(new_ids) > 0 and (jsonb_array_length(coalesce(e.form, '[]'::jsonb)) > 0 or e.signature_required) then
    insert into event_responses (event_id, customer_id, invoice_id, student_ids, answers, signer_name, signature_data, signed_at)
    values (p_event,
            coalesce(fam, (select customer_id from students where id = new_ids[1])),
            nullif(res->>'invoice_id', '')::uuid, new_ids, ans,
            nullif(left(btrim(coalesce(p_signer, '')), 120), ''),
            case when p_signature like 'data:image/png;base64,%' then p_signature end,
            case when p_signature like 'data:image/png;base64,%' then now() end)
    returning id into resp_id;
  end if;
  return res || jsonb_build_object('response_id', resp_id);
end;
$$;
revoke execute on function event_register_form(uuid, uuid[], text, text[], jsonb, text, text) from public, anon;
grant execute on function event_register_form(uuid, uuid[], text, text[], jsonb, text, text) to authenticated;
