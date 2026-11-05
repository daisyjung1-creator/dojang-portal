-- The class days a student actually comes to, when they're in more classes
-- than their plan (e.g. Intermediate A Tue/Thu + Int/Adv Fri on 2x/week).
-- Each entry is "<weekday>:<class name>" (0 = Sunday), e.g. '{2:Intermediate A,4:Intermediate A}'.
-- Empty / null = every scheduled class of their classes (as before).
alter table students add column if not exists class_days text[];

-- End-of-day absences only for the student's own class days.
create or replace function auto_mark_absences(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = public as $$
declare
  local_ts timestamp := p_now at time zone 'America/Edmonton';
  cutoff time := coalesce((select auto_absent_time from invoice_settings where id = 1), '23:30');
  d date;
  n int := 0;
  k int;
begin
  foreach d in array array[local_ts::date - 1, local_ts::date] loop
    continue when d = local_ts::date and local_ts::time < cutoff;
    insert into attendance (student_id, date, class_name, status, auto)
    select st.id, d, cs.class_name, 'absent', true
    from (select distinct class_name from class_schedule
          where active and weekday = extract(dow from d)::int
            and not exists (select 1 from class_cancellations c where c.date = d and (c.class_name is null or c.class_name = class_schedule.class_name))) cs
    join students st on cs.class_name = any (select trim(x) from unnest(string_to_array(coalesce(st.class_name, ''), ',')) x)
    where coalesce(st.status, 'active') <> 'withdrawn'
      and not st.billing_exempt
      and (st.enroll_date is null or st.enroll_date <= d)
      and st.created_at::date <= d
      and (coalesce(cardinality(st.class_days), 0) = 0
           or (extract(dow from d)::int || ':' || cs.class_name) = any (st.class_days))
      and not exists (select 1 from attendance a where a.student_id = st.id and a.date = d
                      and (a.class_name = cs.class_name or a.status in ('vacation', 'double')))
    on conflict (student_id, date, class_name) do nothing;
    get diagnostics k = row_count;
    n := n + k;
  end loop;
  return n;
end $$;
revoke all on function auto_mark_absences(timestamptz) from public, anon, authenticated;
