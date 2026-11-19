-- Declined saved-card charges: which invoice, and when the parent was emailed / reminded
-- (emails are sent by the admin from Home after review).
alter table customers
  add column if not exists card_declined_invoice_id uuid references invoices(id) on delete set null,
  add column if not exists card_decline_emailed_at timestamptz,
  add column if not exists card_decline_reminded_at timestamptz;
