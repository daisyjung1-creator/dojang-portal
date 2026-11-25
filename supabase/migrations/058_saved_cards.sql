-- Card saved at TD Online Mart (Secure Payment Profile) for automatic tuition.
-- Only the profile code and display details are kept here, never the card number.
alter table public.customers add column if not exists card_profile_code text;
alter table public.customers add column if not exists card_profile_mode text check (card_profile_mode in ('test', 'live'));
alter table public.customers add column if not exists card_series_id text;
alter table public.customers add column if not exists card_last4 text;
alter table public.customers add column if not exists card_expiry text;
alter table public.customers add column if not exists card_type text;
alter table public.customers add column if not exists card_saved_at timestamptz;
alter table public.customers add column if not exists card_consent text;
alter table public.customers add column if not exists card_declined_at timestamptz;
alter table public.customers add column if not exists card_decline_message text;
