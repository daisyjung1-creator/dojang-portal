-- "Save your card" link for families moving from TD Recurring Billing to a
-- saved card (Payment Profile). One private link per family; no charge.
alter table customers
  add column if not exists card_link_token uuid not null default gen_random_uuid(),
  -- Card saved through the link while the family's old TD Recurring Billing
  -- account may still be active: no automatic charges until the admin confirms
  -- that account is closed in TD Online Mart (prevents double charges).
  add column if not exists card_legacy_rb_pending boolean not null default false;
create unique index if not exists customers_card_link_token on customers (card_link_token);
