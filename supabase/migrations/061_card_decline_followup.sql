-- Declined saved-card charges: which invoice, and when the parent was emailed / reminded
-- (emails are sent by the admin from Home after review).
alter table customers
  add column if not exists card_declined_invoice_id uuid, -- no FK: a 2nd customers<->invoices link breaks PostgREST embeds (see 062)
  add column if not exists card_decline_emailed_at timestamptz,
  add column if not exists card_decline_reminded_at timestamptz;
