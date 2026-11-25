-- 052: Membership hold (휴관) and subsidy balances.
--
-- Hold: a student taking a break (usually a month or more) with a return
-- date. While on hold: no tuition cycles are billed, nothing is marked absent.
-- After hold_until the student is simply active again.
--
-- Subsidy balance: a grant such as KidSport ($300) that is drawn down by the
-- monthly subsidy line on tuition invoices. subsidy_total is the grant,
-- subsidy_start_date when it began (subsidy lines from then on count against
-- it). subsidy_amount stays the amount taken off each month.
alter table students add column if not exists hold_from date;
alter table students add column if not exists hold_until date;
alter table students add column if not exists hold_reason text;
alter table students add column if not exists subsidy_total numeric(10,2);
alter table students add column if not exists subsidy_start_date date;

create or replace function public.auto_mark_absences(p_now timestamp with time zone default now())
returns integer language plpgsql security definer set search_path to 'public' as $function$
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
      and not (st.hold_until is not null and d <= st.hold_until and d >= coalesce(st.hold_from, d))
      and (coalesce(cardinality(st.class_days), 0) = 0
           or (extract(dow from d)::int || ':' || cs.class_name) = any (st.class_days))
      and not exists (select 1 from attendance a where a.student_id = st.id and a.date = d
                      and (a.class_name = cs.class_name or a.status in ('vacation', 'double')))
    on conflict (student_id, date, class_name) do nothing;
    get diagnostics k = row_count;
    n := n + k;
  end loop;
  return n;
end $function$;
