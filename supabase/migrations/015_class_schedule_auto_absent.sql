-- Class schedule, kiosk check-in and automatic absences.
--
--  * class_schedule: which class runs on which weekday and when (editable on
--    Attendance → Schedule). The kiosk uses it to open the class that's on now.
--  * class_cancellations: a class (or the whole day) that didn't run — no
--    automatic absences for it.
--  * auto_mark_absences(): 10 minutes after a class ends, every active student
--    in that class with nothing marked is recorded absent (attendance.auto =
--    true) and gets a makeup record, the same way the portal does it by hand.
--    Comp Team is unlimited, so no makeup for them. Coaches/instructors are
--    skipped, and so is anyone marked Vacation or Double that day.
--    pg_cron runs it every 10 minutes.

create table if not exists class_schedule (
  id uuid primary key default gen_random_uuid(),
  class_name text not null,
  weekday int not null check (weekday between 0 and 6),   -- 0 = Sunday
  start_time time not null,
  end_time time not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table class_schedule enable row level security;
drop policy if exists "class_schedule read" on class_schedule;
create policy "class_schedule read" on class_schedule for select using (auth.uid() is not null);
drop policy if exists "class_schedule admin write" on class_schedule;
create policy "class_schedule admin write" on class_schedule for all using (is_admin()) with check (is_admin());

insert into class_schedule (class_name, weekday, start_time, end_time)
select * from (values
  ('Beginner', 2, time '16:30', time '17:20'), ('Beginner', 4, time '16:30', time '17:20'),
  ('Intermediate B', 1, time '16:30', time '17:20'), ('Intermediate B', 3, time '16:30', time '17:20'),
  ('Beginner/Intermediate', 1, time '17:30', time '18:20'), ('Beginner/Intermediate', 3, time '17:30', time '18:20'),
  ('Intermediate A', 2, time '17:30', time '18:20'), ('Intermediate A', 4, time '17:30', time '18:20'),
  ('Intermediate/Advance', 5, time '17:00', time '17:50'),
  ('Advance Poomsae', 1, time '18:30', time '19:30'), ('Advance Poomsae', 3, time '18:30', time '19:30'), ('Advance Poomsae', 5, time '18:30', time '19:30'),
  ('Advance Sparring', 2, time '18:30', time '19:30'), ('Advance Sparring', 4, time '18:30', time '19:30'),
  ('HP', 2, time '19:30', time '20:30'), ('HP', 4, time '19:30', time '20:30'),
  ('Comp Team', 6, time '10:00', time '13:30')
) v
where not exists (select 1 from class_schedule);

create table if not exists class_cancellations (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  class_name text,              -- null = every class that day
  reason text,
  created_at timestamptz not null default now()
);
alter table class_cancellations enable row level security;
drop policy if exists "class_cancellations all" on class_cancellations;
create policy "class_cancellations all" on class_cancellations for all using (auth.uid() is not null) with check (auth.uid() is not null);

alter table attendance add column if not exists auto boolean not null default false;

-- Same billing-date maths as src/lib/billingDates.js.
create or replace function add_months_clamped(a date, k int) returns date language sql immutable as $$
  select (date_trunc('month', a) + make_interval(months => k))::date
       + (least(extract(day from a)::int,
                extract(day from (date_trunc('month', a) + make_interval(months => k + 1) - interval '1 day'))::int) - 1);
$$;

create or replace function next_billing_after(p_student uuid, d date) returns date
language plpgsql stable set search_path = public as $$
declare
  s students;
  a date;
  step int;
  k int;
begin
  select * into s from students where id = p_student;
  a := coalesce(s.billing_start_date, s.enroll_date);
  if a is null then return d + 30; end if;
  step := case when s.plan = '3 Months' then 3 else 1 end;
  k := floor(((extract(year from d) - extract(year from a)) * 12 + extract(month from d) - extract(month from a)) / step)::int;
  while add_months_clamped(a, k * step) > d loop k := k - 1; end loop;
  while add_months_clamped(a, k * step) <= d loop k := k + 1; end loop;
  return add_months_clamped(a, k * step);
end $$;

create or replace function auto_mark_absences(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = public as $$
declare
  local_ts timestamp := p_now at time zone 'America/Edmonton';
  d date := local_ts::date;
  t time := local_ts::time;
  cls record;
  s record;
  nb date;
  pay record;
  n int := 0;
begin
  for cls in
    select distinct class_name from class_schedule
    where active and weekday = extract(dow from d)::int and end_time + interval '10 minutes' <= t
      and not exists (select 1 from class_cancellations c where c.date = d and (c.class_name is null or c.class_name = class_schedule.class_name))
  loop
    for s in
      select st.* from students st
      where coalesce(st.status, 'active') <> 'withdrawn'
        and not st.billing_exempt
        and (st.enroll_date is null or st.enroll_date <= d)
        and cls.class_name = any (select trim(x) from unnest(string_to_array(coalesce(st.class_name, ''), ',')) x)
        and not exists (select 1 from attendance a where a.student_id = st.id and a.date = d
                        and (a.class_name = cls.class_name or a.status in ('vacation', 'double')))
    loop
      insert into attendance (student_id, date, class_name, status, auto)
      values (s.id, d, cls.class_name, 'absent', true)
      on conflict (student_id, date, class_name) do nothing;
      n := n + 1;
      -- Comp Team is unlimited: missed classes don't need a makeup.
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
  return n;
end $$;
revoke all on function auto_mark_absences(timestamptz) from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'auto-absent';
select cron.schedule('auto-absent', '*/10 * * * *', 'select public.auto_mark_absences()');
