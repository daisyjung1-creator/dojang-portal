-- Event sign-up form: answers the admin chose to share with parents
-- (e.g. potluck dish names grouped by Main / Side / Dessert).
-- A question is shared when its form entry has "share": true. A shared
-- question may name another question in "group_by"; that question's answer
-- is returned too so the page can group by it.
-- Only active sign-ups count (at least one child still signed up).
-- Nothing that identifies a family is returned — only the answers.
create or replace function public.event_shared_answers(p_event uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  e events;
  keys text[];
begin
  if my_customer_id() is null and not is_admin() then raise exception 'Not allowed.'; end if;
  select * into e from events where id = p_event;
  if not found or e.archived or (not coalesce(e.published, false) and not is_admin()) then return '[]'::jsonb; end if;

  select coalesce(array_agg(distinct k), '{}') into keys
  from jsonb_array_elements(coalesce(e.form, '[]'::jsonb)) q,
       lateral unnest(array[q->>'id', nullif(q->>'group_by', '')]) k
  where coalesce((q->>'share')::boolean, false) and k is not null;

  if cardinality(keys) = 0 then return '[]'::jsonb; end if;

  return coalesce((
    select jsonb_agg(sub.a order by sub.created_at)
    from (
      select r.created_at,
             (select coalesce(jsonb_object_agg(kv.key, kv.value), '{}'::jsonb)
                from jsonb_each(r.answers) kv where kv.key = any(keys)) as a
      from event_responses r
      where r.event_id = p_event
        and exists (select 1 from event_signups s
                    where s.event_id = r.event_id and s.student_id = any(r.student_ids) and s.status = 'signed_up')
    ) sub
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.event_shared_answers(uuid) from public, anon;
grant execute on function public.event_shared_answers(uuid) to authenticated;
