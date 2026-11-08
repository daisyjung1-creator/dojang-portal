-- Membership cancellation requests (Part 6: by email, 14 days before the next
-- payment), the $20 re-registration fee (Part 7.4), and make-ups that expire
-- 30 days after the missed class (Part 8.1).

-- Last day a student's membership is paid for. No tuition is invoiced for a
-- billing cycle that starts after it; the day after, they're withdrawn.
alter table public.students add column if not exists billing_end_date date;
-- The $20 re-registration fee goes on the next tuition invoice, then clears.
alter table public.students add column if not exists reregistration_fee_due boolean not null default false;

create table if not exists public.cancellation_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  student_id uuid not null references public.students(id) on delete cascade,
  received_on date not null,           -- the day the cancellation email arrived
  requested_date date,                 -- the cancellation date the family asked for
  next_payment_date date,              -- next billing date after the email
  days_notice int,
  renewal_cancelled boolean not null,  -- true: 14+ days' notice, the next renewal is cancelled
  billing_end_date date not null,      -- last paid day
  notes text
);
alter table public.cancellation_requests enable row level security;
drop policy if exists "cancellation admin" on public.cancellation_requests;
create policy "cancellation admin" on public.cancellation_requests for all to authenticated using (is_admin()) with check (is_admin());

alter table public.invoice_lines drop constraint if exists invoice_lines_line_kind_check;
alter table public.invoice_lines add constraint invoice_lines_line_kind_check check (line_kind = any (array['tuition', 'discount', 'subsidy', 'reregistration']));

-- Daily: make-ups past their expiry date (30 days after the absence, or the end
-- of the paid period) expire; memberships past their last paid day end.
create or replace function public.daily_housekeeping()
returns void language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'America/Edmonton')::date;
begin
  update makeup_records set status = 'expired'
   where status = 'pending' and expiration_date < today;
  update students set status = 'withdrawn', withdrawn_date = coalesce(withdrawn_date, billing_end_date + 1)
   where coalesce(status, 'active') <> 'withdrawn' and billing_end_date is not null and billing_end_date < today;
end $$;
revoke all on function public.daily_housekeeping() from public, anon, authenticated;

select cron.unschedule('daily-housekeeping') where exists (select 1 from cron.job where jobname = 'daily-housekeeping');
select cron.schedule('daily-housekeeping', '7 7 * * *', 'select public.daily_housekeeping()');
select public.daily_housekeeping();
