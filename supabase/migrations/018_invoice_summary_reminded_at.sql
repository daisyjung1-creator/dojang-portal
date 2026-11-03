-- invoice_summary was created with i.*, which Postgres expands once, so the
-- reminded_at column added in 012 wasn't in it (Billing kept offering the same
-- reminder). Add it at the end of the view.
create or replace view invoice_summary with (security_invoker = true) as
select
  i.id, i.invoice_number, i.customer_id, i.customer_name, i.customer_email, i.customer_address,
  i.invoice_date, i.due_date, i.subtotal, i.gst_rate, i.gst_amount, i.total, i.notes, i.voided,
  i.is_opening_balance, i.emailed_at, i.created_at, i.updated_at,
  coalesce(p.paid, 0)::numeric(12,2) as amount_paid,
  greatest(i.total - coalesce(p.paid, 0), 0)::numeric(12,2) as balance,
  coalesce(r.refunded, 0)::numeric(12,2) as amount_refunded,
  case
    when i.voided then 'Void'
    when coalesce(r.refunded, 0) > 0 and coalesce(r.refunded, 0) >= i.total - 0.005 then 'Refunded'
    when coalesce(r.refunded, 0) > 0 then 'Partially Refunded'
    when coalesce(p.paid, 0) >= i.total then 'Paid'
    when coalesce(p.paid, 0) > 0 then 'Partially Paid'
    else 'Not Paid'
  end as status,
  i.reminded_at
from invoices i
left join (select invoice_id, sum(amount) as paid from invoice_payments where invoice_id is not null group by invoice_id) p on p.invoice_id = i.id
left join (select invoice_id, sum(amount) as refunded from invoice_refunds where invoice_id is not null group by invoice_id) r on r.invoice_id = i.id;
