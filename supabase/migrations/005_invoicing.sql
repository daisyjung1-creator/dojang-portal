-- Invoicing module (replaces Express Invoice).
-- Run after 004. Adds: customers (billing accounts / families), invoice items,
-- invoices + line items, payments against invoices (with receipt numbers),
-- business settings (company info, GST, next invoice/receipt numbers), and a
-- summary view that works out paid amount, balance and status per invoice.
-- Everything here is admin-only.

-- ── Business settings (single row) ─────────────────────────────────────
create table if not exists invoice_settings (
  id int primary key default 1 check (id = 1),
  business_name text not null default 'Edmonton Champion Hankook Taekwondo',
  address text default '',
  phone text default '',
  email text default '',
  website text default '',
  gst_number text default '',
  gst_rate numeric not null default 5,
  next_invoice_number int not null default 1,
  next_receipt_number int not null default 1,
  default_due_days int not null default 0,
  invoice_footer text default 'Thank you!',
  payment_instructions text default '',
  email_subject text default 'Invoice #{number} from {business}',
  email_message text default 'Hi {customer},' || chr(10) || chr(10) || 'Please find your invoice #{number} attached. Amount due: {balance}.' || chr(10) || chr(10) || 'Thank you!',
  logo_data text,                       -- small logo image stored as a data: URL
  updated_at timestamptz not null default now()
);
-- Company profile and numbering copied from Express Invoice. Invoice #3717 was
-- already issued (dated 2026-11-01) and the last receipt seen was #21732, so new
-- numbers continue from there. Check both in Invoice Settings before switching over.
insert into invoice_settings (id, business_name, address, phone, email, next_invoice_number, next_receipt_number, invoice_footer, payment_instructions)
values (1, 'Edmonton Champion Hankook Taekwondo', '101B, 1 Millbourne Market Mall', '780-450-0181', 'hankooktkd@gmail.com', 3718, 21733,
  'Please contact us for more information about payment options.',
  'Interac E-Transfer - Please make your payment via e-Transfer to hankooktkd@gmail.com')
on conflict (id) do nothing;

-- ── Customers (who gets billed: usually a parent / family) ─────────────
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  email text,
  cc_email text,
  phone text,
  phone2 text,
  address text,
  printed_info text,                    -- extra line printed under the address
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists customers_name_idx on customers (lower(name));

-- A student can be linked to the customer who pays for them (siblings share one).
alter table students add column if not exists customer_id uuid references customers(id) on delete set null;

-- ── Items (what goes on an invoice) — reuse fee_items ──────────────────
alter table fee_items add column if not exists description text;
alter table fee_items add column if not exists taxable boolean not null default true;
alter table fee_items add column if not exists active boolean not null default true;
alter table fee_items add column if not exists sort_order int not null default 100;

-- Express Invoice style: "name" is the short Item code (e.g. "3 Month Plan 2D"),
-- "description" is what prints in the Description column. Import your real
-- item list from Invoice Settings → Items → Import.

-- ── Invoices ────────────────────────────────────────────────────────────
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number int unique,
  customer_id uuid references customers(id) on delete restrict,
  customer_name text not null,          -- snapshot at time of invoicing
  customer_email text,
  customer_address text,
  invoice_date date not null default current_date,
  due_date date,
  subtotal numeric(12,2) not null default 0,
  gst_rate numeric not null default 5,
  gst_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  notes text,
  voided boolean not null default false,
  is_opening_balance boolean not null default false,  -- balance carried over from Express Invoice (no number)
  emailed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists invoices_date_idx on invoices (invoice_date);
create index if not exists invoices_customer_idx on invoices (customer_id);

create table if not exists invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  position int not null default 0,
  fee_item_id uuid references fee_items(id) on delete set null,
  student_id uuid references students(id) on delete set null,
  item_name text,
  description text not null default '',
  quantity numeric not null default 1,
  unit_price numeric(12,2) not null default 0,
  taxable boolean not null default true,
  amount numeric(12,2) not null default 0
);
create index if not exists invoice_lines_invoice_idx on invoice_lines (invoice_id);

-- ── Payments applied to invoices (each gets a receipt number) ──────────
create table if not exists invoice_payments (
  id uuid primary key default gen_random_uuid(),
  receipt_number int unique,
  invoice_id uuid references invoices(id) on delete set null,
  customer_id uuid references customers(id) on delete restrict,
  payment_date date not null default current_date,
  method text not null default 'Pre-Authorized Debit',
  amount numeric(12,2) not null,
  reference text,
  notes text,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists invoice_payments_date_idx on invoice_payments (payment_date);
create index if not exists invoice_payments_invoice_idx on invoice_payments (invoice_id);

-- ── Automatic numbering (continues from the numbers in settings) ───────
create or replace function assign_invoice_number()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_opening_balance then
    return new;
  end if;
  if new.invoice_number is null then
    update invoice_settings set next_invoice_number = next_invoice_number + 1
      where id = 1 returning next_invoice_number - 1 into new.invoice_number;
  elsif new.invoice_number >= (select next_invoice_number from invoice_settings where id = 1) then
    update invoice_settings set next_invoice_number = new.invoice_number + 1 where id = 1;
  end if;
  return new;
end $$;

drop trigger if exists invoices_assign_number on invoices;
create trigger invoices_assign_number before insert on invoices
  for each row execute function assign_invoice_number();

create or replace function assign_receipt_number()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.receipt_number is null then
    update invoice_settings set next_receipt_number = next_receipt_number + 1
      where id = 1 returning next_receipt_number - 1 into new.receipt_number;
  elsif new.receipt_number >= (select next_receipt_number from invoice_settings where id = 1) then
    update invoice_settings set next_receipt_number = new.receipt_number + 1 where id = 1;
  end if;
  return new;
end $$;

drop trigger if exists invoice_payments_assign_number on invoice_payments;
create trigger invoice_payments_assign_number before insert on invoice_payments
  for each row execute function assign_receipt_number();

create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists invoices_touch on invoices;
create trigger invoices_touch before update on invoices
  for each row execute function touch_updated_at();

-- ── Summary view: paid / balance / status per invoice ──────────────────
create or replace view invoice_summary with (security_invoker = true) as
select
  i.*,
  coalesce(p.paid, 0)::numeric(12,2) as amount_paid,
  greatest(i.total - coalesce(p.paid, 0), 0)::numeric(12,2) as balance,
  case
    when i.voided then 'Void'
    when coalesce(p.paid, 0) >= i.total then 'Paid'
    when coalesce(p.paid, 0) > 0 then 'Partially Paid'
    else 'Not Paid'
  end as status
from invoices i
left join (
  select invoice_id, sum(amount) as paid from invoice_payments
  where invoice_id is not null group by invoice_id
) p on p.invoice_id = i.id;

-- ── Report views (aggregated in the database so totals never get cut off) ──
create or replace view customer_balances with (security_invoker = true) as
select customer_id,
       count(*) as invoice_count,
       sum(total)::numeric(12,2) as total_invoiced,
       sum(balance)::numeric(12,2) as balance,
       max(invoice_date) as last_invoice_date,
       max(invoice_number) as last_invoice_number,
       min(coalesce(due_date, invoice_date)) filter (where balance > 0) as oldest_due_date
from invoice_summary
where not voided and customer_id is not null
group by customer_id;

create or replace view monthly_sales with (security_invoker = true) as
select to_char(invoice_date, 'YYYY-MM') as month,
       count(*) as invoice_count,
       sum(subtotal)::numeric(12,2) as subtotal,
       sum(gst_amount)::numeric(12,2) as gst,
       sum(total)::numeric(12,2) as total,
       sum(balance)::numeric(12,2) as unpaid
from invoice_summary
where not voided and not is_opening_balance   -- carried-over balances aren't new sales
group by 1;

create or replace view monthly_payments with (security_invoker = true) as
select to_char(payment_date, 'YYYY-MM') as month,
       method,
       count(*) as payment_count,
       sum(amount)::numeric(12,2) as amount
from invoice_payments
group by 1, 2;

-- ── Row level security: admin only ─────────────────────────────────────
alter table invoice_settings enable row level security;
alter table customers enable row level security;
alter table invoices enable row level security;
alter table invoice_lines enable row level security;
alter table invoice_payments enable row level security;

drop policy if exists "invoice_settings admin only" on invoice_settings;
create policy "invoice_settings admin only" on invoice_settings for all using (is_admin()) with check (is_admin());
drop policy if exists "customers admin only" on customers;
create policy "customers admin only" on customers for all using (is_admin()) with check (is_admin());
drop policy if exists "invoices admin only" on invoices;
create policy "invoices admin only" on invoices for all using (is_admin()) with check (is_admin());
drop policy if exists "invoice_lines admin only" on invoice_lines;
create policy "invoice_lines admin only" on invoice_lines for all using (is_admin()) with check (is_admin());
drop policy if exists "invoice_payments admin only" on invoice_payments;
create policy "invoice_payments admin only" on invoice_payments for all using (is_admin()) with check (is_admin());
