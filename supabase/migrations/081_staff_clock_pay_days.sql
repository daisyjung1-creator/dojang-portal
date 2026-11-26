-- 081: Staff Clock → Pay Hours. Paid time per employee per day is worked out
-- from clock records and the schedule (src/lib/clockPayHours.js). When the
-- admin changes a day by hand, the new paid minutes are kept here and win over
-- the calculation. Payroll reads the month's total from the same code.
create table if not exists staff_clock_pay_days (
  employee_id uuid not null references staff_clock_employees(id) on delete cascade,
  date date not null,
  minutes integer not null check (minutes >= 0 and minutes <= 1440),
  note text,
  updated_at timestamptz not null default now(),
  primary key (employee_id, date)
);
alter table staff_clock_pay_days enable row level security;
drop policy if exists "clock pay days admin" on staff_clock_pay_days;
create policy "clock pay days admin" on staff_clock_pay_days for all using (is_admin()) with check (is_admin());
