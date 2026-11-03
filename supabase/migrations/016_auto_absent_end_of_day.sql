-- Attendance is sometimes entered after the day is over, so automatic
-- absences now wait until the end of the day (Invoice Settings →
-- auto_absent_time, default 11:30 pm Edmonton) and cover every class that day.
-- Yesterday is re-checked too, in case a run was missed.
alter table invoice_settings add column if not exists auto_absent_time time not null default '23:30';

create or replace function auto_mark_absences(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = public as $$
declare
  local_ts timestamp := p_now at time zone 'America/Edmonton';
  cutoff time := coalesce((select auto_absent_time from invoice_settings where id = 1), '23:30');
  d date;
  cls record;
  s record;
  nb date;
  pay record;
  n int := 0;
begin
  foreach d in array array[local_ts::date - 1, local_ts::date] loop
    continue when d = local_ts::date and local_ts::time < cutoff;
    for cls in
      select distinct class_name from class_schedule
      where active and weekday = extract(dow from d)::int
        and not exists (select 1 from class_cancellations c where c.date = d and (c.class_name is null or c.class_name = class_schedule.class_name))
    loop
      for s in
        select st.* from students st
        where coalesce(st.status, 'active') <> 'withdrawn'
          and not st.billing_exempt
          and (st.enroll_date is null or st.enroll_date <= d)
          and st.created_at::date <= d
          and cls.class_name = any (select trim(x) from unnest(string_to_array(coalesce(st.class_name, ''), ',')) x)
          and not exists (select 1 from attendance a where a.student_id = st.id and a.date = d
                          and (a.class_name = cls.class_name or a.status in ('vacation', 'double')))
      loop
        insert into attendance (student_id, date, class_name, status, auto)
        values (s.id, d, cls.class_name, 'absent', true)
        on conflict (student_id, date, class_name) do nothing;
        n := n + 1;
        if not ('Comp Team' = any (select trim(x) from unnest(string_to_array(coalesce(s.class_name, ''), ',')) x))
           and not exists (select 1 from makeup_records m where m.student_id = s.id and m.absence_date = d and m.class_name = cls.class_name) then
          nb := next_billing_after(s.id, d);
          select * into pay from payments where student_id = s.id and cycle_start = nb;
          insert into makeup_records (student_id, absence_date, class_name, next_billing_date, paid_period_end, tentative_expiration, expiration_date, conditional, status)
          values (s.id, d, cls.class_name, nb, nb - 1, d + 30,
                  case when pay.id is null then d + 30 when pay.paid then d + 30 else nb - 1 end,
                  pay.id is null, 'pending');
        end if;
      end loop;
    end loop;
  end loop;
  return n;
end $$;
revoke all on function auto_mark_absences(timestamptz) from public, anon, authenticated;
