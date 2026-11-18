-- Online card payments through TD Online Mart (Worldline/Shift4).
-- Each invoice gets an unguessable link key for its public "Pay now" page.
alter table public.invoices add column if not exists pay_token uuid not null default gen_random_uuid();
create unique index if not exists invoices_pay_token_idx on public.invoices (pay_token);
-- Off until the dojang turns it on; 'test' uses the TD test account secrets.
alter table public.invoice_settings add column if not exists online_pay boolean not null default false;
alter table public.invoice_settings add column if not exists online_pay_mode text not null default 'test' check (online_pay_mode in ('test', 'live'));
-- Gateway transaction id for payments taken online.
alter table public.invoice_payments add column if not exists gateway_txn text;
