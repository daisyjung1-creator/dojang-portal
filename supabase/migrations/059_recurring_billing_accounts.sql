-- TD Recurring Billing account created from the online Pay now page.
alter table public.customers add column if not exists rb_account_id text;
alter table public.customers add column if not exists rb_mode text check (rb_mode in ('test', 'live'));
alter table public.customers add column if not exists rb_amount numeric(10,2);
alter table public.customers add column if not exists rb_months int;
alter table public.customers add column if not exists rb_first_billing date;
alter table public.customers add column if not exists rb_card_last4 text;
alter table public.customers add column if not exists rb_created_at timestamptz;
alter table public.customers add column if not exists rb_consent text;
