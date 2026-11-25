-- Money received outside invoices, e.g. a KidSport grant cheque.
-- Invoices show the grant as a deduction, so this is the income that covers it.
create table if not exists other_income (
  id uuid primary key default gen_random_uuid(),
  received_on date not null default current_date,
  source text not null default 'KidSport',
  amount numeric(10,2) not null check (amount > 0),
  reference text,          -- cheque number
  note text,               -- which students it covers
  created_at timestamptz not null default now()
);
alter table other_income enable row level security;
drop policy if exists "other_income admin" on other_income;
create policy "other_income admin" on other_income for all using (is_admin()) with check (is_admin());
