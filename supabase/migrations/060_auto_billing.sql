-- Daily automatic tuition for families with a saved card (td-pay "autobill").
-- One row per day: the row is also the lock, so the run never happens twice.
create table if not exists auto_billing_runs (
  run_date date primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  results jsonb
);
alter table auto_billing_runs enable row level security;
drop policy if exists auto_billing_runs_admin on auto_billing_runs;
create policy auto_billing_runs_admin on auto_billing_runs for select using (public.is_admin());

-- 13:05 UTC = 6:05 am MST / 7:05 am MDT (Edmonton).
select cron.unschedule('auto-tuition') where exists (select 1 from cron.job where jobname = 'auto-tuition');
select cron.schedule(
  'auto-tuition',
  '5 13 * * *',
  $$select net.http_post(
      url := 'https://eihgzlbuldejcmqcomub.supabase.co/functions/v1/td-pay',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{"action":"autobill"}'::jsonb,
      timeout_milliseconds := 120000
    )$$
);
