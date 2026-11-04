-- Belt testing: test days, the students on each test's list, and where each
-- student's class count starts (their last test).

alter table students add column if not exists last_test_date date;
-- Everyone already enrolled last tested (or started counting) on July 31, 2026.
update students set last_test_date = '2026-07-31' where last_test_date is null and coalesce(enroll_date, '2000-01-01') <= '2026-07-31';

create table if not exists belt_tests (
  id uuid primary key default gen_random_uuid(),
  test_date date not null,
  title text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists belt_test_entries (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references belt_tests(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  current_belt text,
  target_belt text,
  fee_item text,
  fee_amount numeric(10,2),
  form_received boolean not null default false,
  result text not null default 'pending' check (result in ('pending', 'pass', 'retest', 'absent')),
  promoted_at timestamptz,
  notice_sent_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  unique (test_id, student_id)
);

alter table belt_tests enable row level security;
alter table belt_test_entries enable row level security;
drop policy if exists "belt_tests admin" on belt_tests;
create policy "belt_tests admin" on belt_tests for all using (is_admin()) with check (is_admin());
drop policy if exists "belt_test_entries admin" on belt_test_entries;
create policy "belt_test_entries admin" on belt_test_entries for all using (is_admin()) with check (is_admin());

-- Intermediate/Advance (Blue – Red Stripe) testing is $60.
update fee_items set default_amount = 60 where name = 'Test Fee (Int/Adv)';

insert into belt_tests (test_date, title)
select '2026-11-06', 'November 2026 Belt Testing'
where not exists (select 1 from belt_tests where test_date = '2026-11-06');
