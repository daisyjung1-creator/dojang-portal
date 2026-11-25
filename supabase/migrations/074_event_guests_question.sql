-- 074: event guests and a question for families
--  * allow_guests / guest_price: families can bring guests (by name), each
--    charged guest_price (can differ from the student price, can be 0)
--  * question / question_required: e.g. "What food will you bring?" for a
--    potluck; the family's answer is kept on their sign-up
alter table events add column if not exists allow_guests boolean not null default false;
alter table events add column if not exists guest_price numeric(10, 2) not null default 0;
alter table events add column if not exists question text;
alter table events add column if not exists question_required boolean not null default false;
alter table event_signups add column if not exists answer text;

create table if not exists event_guests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  invoice_id uuid references invoices(id) on delete set null,
  name text not null,
  removed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists event_guests_event_idx on event_guests (event_id);
alter table event_guests enable row level security;
create policy "event_guests admin" on event_guests for all using (is_admin()) with check (is_admin());
create policy "event_guests parent read" on event_guests for select using (customer_id is not null and customer_id = my_customer_id());

-- Sign up students and/or guests in one go (one invoice for the family).
-- Guests need at least one of the family's students on the event (now or already).
create or replace function event_register(p_event uuid, p_students uuid[], p_note text default null, p_guests text[] default null, p_answer text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  e events;
  today date := (now() at time zone 'America/Edmonton')::date;
  is_adm boolean := is_admin();
  fam uuid;
  fams uuid[];
  c customers;
  new_ids uuid[];
  guests text[];
  taken int;
  rate numeric;
  sub numeric := 0;
  tax_base numeric := 0;
  gst numeric;
  inv_id uuid;
  inv_no int;
  tok uuid;
  sid uuid;
  sname text;
  g text;
  pos int := 0;
  ans text := nullif(btrim(coalesce(p_answer, '')), '');
begin
  select * into e from events where id = p_event;
  if not found or e.archived then raise exception 'This event is not available.'; end if;
  p_students := coalesce(p_students, '{}'::uuid[]);
  select coalesce(array_agg(left(btrim(x), 80)), '{}'::text[]) into guests from unnest(coalesce(p_guests, '{}'::text[])) x where btrim(x) <> '';
  if cardinality(guests) > 0 and not e.allow_guests then raise exception 'Guests are not open for this event.'; end if;
  if cardinality(guests) > 10 then raise exception 'Up to 10 guests at a time, please.'; end if;
  if e.question is not null and e.question_required and ans is null and cardinality(p_students) > 0 then
    raise exception 'Please answer: %', e.question;
  end if;

  if is_adm then
    if cardinality(p_students) = 0 then raise exception 'Choose at least one student.'; end if;
    select array_agg(distinct s.customer_id) into fams from students s where s.id = any (p_students);
    if fams is null or cardinality(fams) <> 1 or fams[1] is null then raise exception 'All students must belong to one family account.'; end if;
    fam := fams[1];
  else
    fam := my_customer_id();
    if fam is null then raise exception 'Not allowed.'; end if;
    if not e.published then raise exception 'This event is not available.'; end if;
    if e.signup_deadline is not null and e.signup_deadline < today then raise exception 'Sign-up for this event has closed.'; end if;
    if coalesce(e.end_date, e.start_date) is not null and coalesce(e.end_date, e.start_date) < today then raise exception 'This event is over.'; end if;
    if exists (select 1 from unnest(p_students) x where x not in (select my_student_ids())) then raise exception 'Not allowed.'; end if;
  end if;
  select * into c from customers where id = fam;

  select coalesce(array_agg(x), '{}'::uuid[]) into new_ids from unnest(p_students) x
  where not exists (select 1 from event_signups es where es.event_id = p_event and es.student_id = x and es.status = 'signed_up');
  if cardinality(new_ids) = 0 and cardinality(guests) = 0 then raise exception 'Already signed up.'; end if;
  if cardinality(guests) > 0 and cardinality(new_ids) = 0
     and not exists (select 1 from event_signups es where es.event_id = p_event and es.customer_id = fam and es.status = 'signed_up') then
    raise exception 'Sign up at least one student to bring guests.';
  end if;

  if e.capacity is not null then
    select (select count(*) from event_signups where event_id = p_event and status = 'signed_up')
         + (select count(*) from event_guests where event_id = p_event and removed_at is null) into taken;
    if taken + cardinality(new_ids) + cardinality(guests) > e.capacity then
      raise exception 'Sorry, only % spot(s) left.', greatest(e.capacity - taken, 0);
    end if;
  end if;

  if (e.price > 0 and cardinality(new_ids) > 0) or (e.guest_price > 0 and cardinality(guests) > 0) then
    select coalesce(gst_rate, 5) into rate from invoice_settings where id = 1;
    insert into invoices (customer_id, customer_name, customer_email, customer_address, invoice_date, due_date, gst_rate, notes)
    values (fam, c.name, c.email, nullif(concat_ws(E'\n', nullif(c.address, ''), nullif(c.printed_info, '')), ''), today,
            greatest(today, coalesce(e.signup_deadline, e.start_date, today)), rate,
            'Event: ' || e.title || coalesce(' (' || to_char(e.start_date, 'Mon DD, YYYY') || ')', ''))
    returning id, invoice_number, pay_token into inv_id, inv_no, tok;
    if e.price > 0 then
      foreach sid in array new_ids loop
        select name into sname from students where id = sid;
        insert into invoice_lines (invoice_id, position, fee_item_id, student_id, item_name, description, quantity, unit_price, taxable, amount)
        values (inv_id, pos, e.fee_item_id, sid, e.title, e.title || ' - ' || sname, 1, e.price, e.taxable, e.price);
        pos := pos + 1;
        sub := sub + e.price;
        if e.taxable then tax_base := tax_base + e.price; end if;
      end loop;
    end if;
    if e.guest_price > 0 and cardinality(guests) > 0 then
      insert into invoice_lines (invoice_id, position, fee_item_id, item_name, description, quantity, unit_price, taxable, amount)
      values (inv_id, pos, e.fee_item_id, e.title || ' - guest', e.title || ' - guest' || case when cardinality(guests) > 1 then 's' else '' end || ': ' || array_to_string(guests, ', '),
              cardinality(guests), e.guest_price, e.taxable, e.guest_price * cardinality(guests));
      sub := sub + e.guest_price * cardinality(guests);
      if e.taxable then tax_base := tax_base + e.guest_price * cardinality(guests); end if;
    end if;
    gst := round(tax_base * rate / 100, 2);
    update invoices set subtotal = round(sub, 2), gst_amount = gst, total = round(sub, 2) + gst where id = inv_id;
  end if;

  if cardinality(new_ids) > 0 then
    insert into event_signups (event_id, student_id, customer_id, invoice_id, status, source, note, answer)
    select p_event, x, fam, inv_id, 'signed_up', case when is_adm then 'admin' else 'parent' end, nullif(btrim(coalesce(p_note, '')), ''), ans
    from unnest(new_ids) x
    on conflict (event_id, student_id) do update set status = 'signed_up', invoice_id = excluded.invoice_id, customer_id = excluded.customer_id,
      source = excluded.source, note = excluded.note, answer = excluded.answer, created_at = now();
  elsif ans is not null then
    update event_signups set answer = ans where event_id = p_event and customer_id = fam and status = 'signed_up';
  end if;
  foreach g in array guests loop
    insert into event_guests (event_id, customer_id, invoice_id, name) values (p_event, fam, inv_id, g);
  end loop;

  if not is_adm then
    insert into dashboard_notes (note_date, body, link_tab)
    values (null, 'Event sign-up: ' || coalesce((select string_agg(name, ', ') from students where id = any (new_ids)), '')
                  || case when cardinality(guests) > 0 then case when cardinality(new_ids) > 0 then ' + ' else '' end || cardinality(guests) || ' guest(s)' else '' end
                  || ' → ' || e.title || coalesce(' — "' || left(ans, 80) || '"', ''), 'events');
  end if;

  return jsonb_build_object('invoice_id', inv_id, 'invoice_number', inv_no, 'pay_token', tok,
                            'total', (select total from invoices where id = inv_id), 'signed_up', cardinality(new_ids), 'guests', cardinality(guests));
end;
$$;
revoke execute on function event_register(uuid, uuid[], text, text[], text) from public, anon;
grant execute on function event_register(uuid, uuid[], text, text[], text) to authenticated;

-- (074b) parents can see their own children's make-up classes
create policy "makeup_records parent read" on makeup_records for select using (student_id in (select my_student_ids()));
