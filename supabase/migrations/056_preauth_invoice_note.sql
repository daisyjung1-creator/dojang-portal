-- Extra paragraph added to invoice emails for families on pre-authorized
-- credit card payments: reply to approve charging the card on file.
alter table public.invoice_settings add column if not exists preauth_note text;
