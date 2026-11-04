-- Account credit.
-- A payment keeps the full amount received (so receipts and money-in reports
-- are right); the part that's more than the invoice owed is its
-- credit_amount and goes to the family's credit. Credit is used on a later
-- invoice through credit_applications, which count as paid on that invoice
-- without counting as new money in.

alter table invoice_payments add column if not exists credit_amount numeric(12,2) not null default 0;

create table if not exists credit_applications (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  invoice_id uuid not null references invoices(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  applied_date date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists credit_applications_invoice on credit_applications(invoice_id);
create index if not exists credit_applications_customer on credit_applications(customer_id);
alter table credit_applications enable row level security;
drop policy if exists "credit_applications admin" on credit_applications;
create policy "credit_applications admin" on credit_applications for all using (is_admin()) with check (is_admin());

-- What has been paid toward an invoice: payments (minus any part kept as
-- credit) plus credit used on it.
create or replace function invoice_amount_applied(p_invoice uuid, p_skip_payment uuid default null) returns numeric
language sql stable security invoker set search_path = public as $$
  select coalesce((select sum(amount - credit_amount) from invoice_payments where invoice_id = p_invoice and id is distinct from p_skip_payment), 0)
       + coalesce((select sum(amount) from credit_applications where invoice_id = p_invoice), 0)
$$;

-- Work out each payment's credit part as it's saved.
create or replace function invoice_payments_credit_part() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  owed numeric;
begin
  if new.invoice_id is null then
    new.credit_amount := case when new.customer_id is null then 0 else greatest(new.amount, 0) end;
  else
    select greatest(i.total - invoice_amount_applied(i.id, new.id), 0) into owed from invoices i where i.id = new.invoice_id;
    new.credit_amount := greatest(new.amount - coalesce(owed, 0), 0);
  end if;
  return new;
end $$;
drop trigger if exists invoice_payments_credit_part on invoice_payments;
create trigger invoice_payments_credit_part before insert or update of amount, invoice_id, customer_id on invoice_payments
  for each row execute function invoice_payments_credit_part();

-- Family credit available now.
create or replace view customer_credit with (security_invoker = true) as
select c.id as customer_id,
  (coalesce((select sum(credit_amount) from invoice_payments p where p.customer_id = c.id), 0)
   - coalesce((select sum(amount) from credit_applications a where a.customer_id = c.id), 0)
   - coalesce((select sum(amount) from invoice_refunds r where r.customer_id = c.id and r.invoice_id is null), 0))::numeric(12,2) as credit
from customers c;

-- Use the family's credit on an invoice (all of it, up to what's owed, or a
-- set amount). Returns the amount used.
create or replace function apply_customer_credit(p_invoice uuid, p_amount numeric default null) returns numeric
language plpgsql security invoker set search_path = public as $$
declare
  inv record;
  avail numeric;
  owed numeric;
  use_amt numeric;
begin
  select id, customer_id, total, voided into inv from invoices where id = p_invoice;
  if not found or inv.customer_id is null or inv.voided then return 0; end if;
  select credit into avail from customer_credit where customer_id = inv.customer_id;
  owed := greatest(inv.total - invoice_amount_applied(inv.id), 0);
  use_amt := least(coalesce(avail, 0), owed, coalesce(p_amount, owed));
  if use_amt <= 0.004 then return 0; end if;
  insert into credit_applications (customer_id, invoice_id, amount) values (inv.customer_id, inv.id, round(use_amt, 2));
  return round(use_amt, 2);
end $$;
grant execute on function apply_customer_credit(uuid, numeric) to authenticated;

-- Invoice summary: "paid" now includes credit used and leaves out the part of
-- a payment kept as credit.
create or replace view invoice_summary with (security_invoker = true) as
select
  i.id, i.invoice_number, i.customer_id, i.customer_name, i.customer_email, i.customer_address,
  i.invoice_date, i.due_date, i.subtotal, i.gst_rate, i.gst_amount, i.total, i.notes, i.voided,
  i.is_opening_balance, i.emailed_at, i.created_at, i.updated_at,
  (coalesce(p.paid, 0) + coalesce(a.used, 0))::numeric(12,2) as amount_paid,
  greatest(i.total - coalesce(p.paid, 0) - coalesce(a.used, 0), 0)::numeric(12,2) as balance,
  coalesce(r.refunded, 0)::numeric(12,2) as amount_refunded,
  case
    when i.voided then 'Void'
    when coalesce(r.refunded, 0) > 0 and coalesce(r.refunded, 0) >= i.total - 0.005 then 'Refunded'
    when coalesce(r.refunded, 0) > 0 then 'Partially Refunded'
    when coalesce(p.paid, 0) + coalesce(a.used, 0) >= i.total then 'Paid'
    when coalesce(p.paid, 0) + coalesce(a.used, 0) > 0 then 'Partially Paid'
    else 'Not Paid'
  end as status,
  i.reminded_at,
  coalesce(a.used, 0)::numeric(12,2) as credit_used
from invoices i
left join (select invoice_id, sum(amount - credit_amount) as paid from invoice_payments where invoice_id is not null group by invoice_id) p on p.invoice_id = i.id
left join (select invoice_id, sum(amount) as used from credit_applications group by invoice_id) a on a.invoice_id = i.id
left join (select invoice_id, sum(amount) as refunded from invoice_refunds where invoice_id is not null group by invoice_id) r on r.invoice_id = i.id;

-- Tuition "paid" status follows the same rule.
create or replace function sync_tuition_status(p_invoice uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  inv record;
  ln record;
  is_paid boolean;
begin
  if p_invoice is null then return; end if;
  select i.voided, i.total, invoice_amount_applied(i.id) as paid,
         greatest((select max(payment_date) from invoice_payments where invoice_id = i.id), (select max(applied_date) from credit_applications where invoice_id = i.id)) as last_paid
    into inv from invoices i where i.id = p_invoice;
  if not found then return; end if;
  is_paid := not inv.voided and inv.paid >= inv.total - 0.005;
  for ln in select distinct student_id, cycle_start, sum(amount) over (partition by student_id, cycle_start) as amt
            from invoice_lines where invoice_id = p_invoice and student_id is not null and cycle_start is not null and line_kind = 'tuition' loop
    if is_paid then
      insert into payments (student_id, cycle_start, paid, amount, paid_date)
      values (ln.student_id, ln.cycle_start, true, ln.amt, coalesce(inv.last_paid, current_date))
      on conflict (student_id, cycle_start) do update set paid = true, amount = excluded.amount, paid_date = excluded.paid_date;
      update makeup_records set conditional = false, expiration_date = tentative_expiration,
        status = case when status in ('reserved', 'completed') then status when tentative_expiration < current_date then 'expired' else 'pending' end
      where student_id = ln.student_id and next_billing_date = ln.cycle_start;
    else
      delete from payments where student_id = ln.student_id and cycle_start = ln.cycle_start;
      update makeup_records set conditional = true, expiration_date = tentative_expiration,
        status = case when status in ('reserved', 'completed') then status when tentative_expiration < current_date then 'expired' else 'pending' end
      where student_id = ln.student_id and next_billing_date = ln.cycle_start;
    end if;
  end loop;
end $$;
revoke all on function sync_tuition_status(uuid) from public, anon, authenticated;

create or replace function credit_applications_sync_tuition() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then perform sync_tuition_status(new.invoice_id); end if;
  if tg_op in ('UPDATE', 'DELETE') then perform sync_tuition_status(old.invoice_id); end if;
  return null;
end $$;
drop trigger if exists credit_applications_sync_tuition on credit_applications;
create trigger credit_applications_sync_tuition after insert or update or delete on credit_applications
  for each row execute function credit_applications_sync_tuition();

-- Open-invoice customer-info sync (020) uses the same "paid" rule.
create or replace function customers_sync_open_invoices() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  old_addr text := nullif(concat_ws(E'\n', nullif(old.address, ''), nullif(old.printed_info, '')), '');
  new_addr text := nullif(concat_ws(E'\n', nullif(new.address, ''), nullif(new.printed_info, '')), '');
begin
  update invoices i set
    customer_name = case when new.name is distinct from old.name and i.customer_name is not distinct from old.name then new.name else i.customer_name end,
    customer_email = case when new.email is distinct from old.email and coalesce(i.customer_email, '') = coalesce(old.email, '') then new.email else i.customer_email end,
    customer_address = case when new_addr is distinct from old_addr and coalesce(i.customer_address, '') = coalesce(old_addr, '') then new_addr else i.customer_address end
  where i.customer_id = new.id
    and not i.voided
    and i.total > invoice_amount_applied(i.id) + 0.005;
  return new;
end $$;

-- Existing payments: work out their credit part (in date order so earlier
-- payments are applied first).
alter table invoice_payments disable trigger invoice_payments_credit_part;
update invoice_payments set credit_amount = amount;
alter table invoice_payments enable trigger invoice_payments_credit_part;
do $$
declare r record;
begin
  for r in select id from invoice_payments order by payment_date, receipt_number loop
    update invoice_payments set amount = amount where id = r.id;
  end loop;
end $$;
