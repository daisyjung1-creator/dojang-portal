-- Payroll: staff, pay settings and payslips (replaces the Vertex42 payslip
-- spreadsheet). Hours come from the staff attendance app (Team Hankook).

create table if not exists payroll_settings (
  id int primary key default 1 check (id = 1),
  company_name text,
  address text,
  phone text,
  email text,
  contact_line text,
  vacation_pct numeric(5,2) not null default 4
);
insert into payroll_settings (id, company_name, address, phone, email, contact_line)
values (1, '1893622 Alberta LTD', '1-Millbourne Shopping Centre unit 101B', '+1 780-450-0181', 'hankooktkd@gmail.com', 'Chang Hun Jung, 780-450-0181, hankooktkd@gmail.com')
on conflict (id) do nothing;

create table if not exists payroll_employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  attendance_employee_id uuid,          -- employees.id in the attendance app
  address text,
  phone text,
  email text,
  sin_masked text,                      -- e.g. ***-***-323 (never the full SIN)
  payroll_no text,
  pay_type text not null default 'Monthly',
  payment_method text not null default 'Cheque',
  hourly_rate numeric(8,2),
  vacation_pct numeric(5,2),            -- blank = company default
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists payslips (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references payroll_employees(id) on delete cascade,
  pay_date date not null,
  period_start date,
  period_end date,
  pay_type text,
  hours numeric(8,2) not null default 0,
  rate numeric(8,2) not null default 0,
  standard_pay numeric(10,2) not null default 0,
  overtime_hours numeric(8,2) not null default 0,
  overtime_rate numeric(8,2) not null default 0,
  overtime_pay numeric(10,2) not null default 0,
  vacation_pay numeric(10,2) not null default 0,
  bonus numeric(10,2) not null default 0,
  sick_pay numeric(10,2) not null default 0,
  expenses numeric(10,2) not null default 0,
  gross numeric(10,2) not null default 0,
  tax numeric(10,2) not null default 0,
  cpp numeric(10,2) not null default 0,
  ei numeric(10,2) not null default 0,
  other_deductions numeric(10,2) not null default 0,
  total_deductions numeric(10,2) not null default 0,
  net numeric(10,2) not null default 0,
  payment_method text,
  notes text,
  created_at timestamptz not null default now(),
  unique (employee_id, pay_date)
);

alter table payroll_settings enable row level security;
alter table payroll_employees enable row level security;
alter table payslips enable row level security;
drop policy if exists "payroll_settings admin" on payroll_settings;
create policy "payroll_settings admin" on payroll_settings for all using (is_admin()) with check (is_admin());
drop policy if exists "payroll_employees admin" on payroll_employees;
create policy "payroll_employees admin" on payroll_employees for all using (is_admin()) with check (is_admin());
drop policy if exists "payslips admin" on payslips;
create policy "payslips admin" on payslips for all using (is_admin()) with check (is_admin());
