-- Student details: emergency contact, address, billing start date (defaults
-- to the enrollment date), 1-month / 3-month plan, and subsidy tracking.
-- guardian_email may hold several addresses separated by commas; invoices,
-- receipts and other emails go to all of them.

alter table students add column if not exists address text;
alter table students add column if not exists emergency_name text;
alter table students add column if not exists emergency_phone text;
alter table students add column if not exists billing_start_date date;   -- null = same as enroll_date
alter table students add column if not exists plan text not null default '1 Month';
alter table students add column if not exists subsidy boolean not null default false;
alter table students add column if not exists subsidy_name text;          -- e.g. KidSport
alter table students add column if not exists subsidy_amount numeric(12,2);
alter table students add column if not exists subsidy_end_date date;

alter table students drop constraint if exists students_plan_check;
alter table students add constraint students_plan_check check (plan in ('1 Month', '3 Months'));
