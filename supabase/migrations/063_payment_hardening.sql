-- 1) Private key for the daily automatic tuition run: only the database (pg_cron)
--    and the td-pay function (service role) can read it. No RLS policies = no
--    access for the public/anon or logged-in portal users.
create table if not exists app_secrets (
  name text primary key,
  value text not null,
  created_at timestamptz not null default now()
);
alter table app_secrets enable row level security;
revoke all on app_secrets from anon, authenticated;
insert into app_secrets (name, value)
values ('autobill_key', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (name) do nothing;

select cron.unschedule('auto-tuition') where exists (select 1 from cron.job where jobname = 'auto-tuition');
select cron.schedule(
  'auto-tuition',
  '5 13 * * *',
  $$select net.http_post(
      url := 'https://eihgzlbuldejcmqcomub.supabase.co/functions/v1/td-pay',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := jsonb_build_object('action', 'autobill', 'key', (select value from app_secrets where name = 'autobill_key')),
      timeout_milliseconds := 120000
    )$$
);

-- 2) Failed online card attempts (card-testing protection on the public pay page).
create table if not exists pay_attempts (
  id bigint generated always as identity primary key,
  invoice_id uuid,
  created_at timestamptz not null default now(),
  message text
);
create index if not exists pay_attempts_recent on pay_attempts (created_at desc);
alter table pay_attempts enable row level security;
drop policy if exists pay_attempts_admin on pay_attempts;
create policy pay_attempts_admin on pay_attempts for select using (public.is_admin());
