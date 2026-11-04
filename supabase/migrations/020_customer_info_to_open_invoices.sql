-- When a family's name, email or address changes, invoices that aren't fully
-- paid pick up the new details (so reminders go to the right address).
-- Paid invoices keep what was printed on them. A value someone typed by hand
-- on one invoice (different from the old customer value) is left alone.
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
    and i.total > coalesce((select sum(p.amount) from invoice_payments p where p.invoice_id = i.id), 0) + 0.005;
  return new;
end $$;

drop trigger if exists customers_sync_open_invoices on customers;
create trigger customers_sync_open_invoices after update of name, email, address, printed_info on customers
  for each row execute function customers_sync_open_invoices();
