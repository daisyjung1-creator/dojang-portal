-- Run this after schema.sql. Adds: withdrawn/active student status (for
-- linking leads to previously-enrolled kids), tryout booking confirmation
-- emails, and cross-class makeup attendance.

-- ── Students: active/withdrawn status ──────────────────────────────────
alter table students add column if not exists status text not null default 'active' check (status in ('active', 'withdrawn'));
alter table students add column if not exists withdrawn_date date;

-- ── Leads: link to a previously-enrolled student ───────────────────────
alter table leads add column if not exists linked_student_id uuid references students(id) on delete set null;

-- ── Makeup records: which class the rescheduled session happens in ────
-- (may differ from the class the student originally missed)
alter table makeup_records add column if not exists reservation_class_name text;

-- ── Attendance: track makeup sessions attended outside the home class ──
alter table attendance add column if not exists is_makeup boolean not null default false;
alter table attendance add column if not exists makeup_record_id uuid references makeup_records(id) on delete set null;

-- ── Tryouts: booking confirmation email tracking ───────────────────────
alter table tryouts add column if not exists confirmation_sent boolean not null default false;

-- ── Email queue (welcome emails, tryout confirmations, later invoices/receipts) ──
create table if not exists email_queue (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('welcome', 'tryout_confirmation', 'invoice', 'receipt')),
  student_id uuid references students(id) on delete set null,
  recipient_email text not null,
  payload jsonb,
  sent boolean not null default false,
  created_at timestamptz not null default now()
);

alter table email_queue enable row level security;
create policy "email_queue admin only" on email_queue for all using (is_admin()) with check (is_admin());

-- The send-emails Edge Function uses the service role key, which bypasses
-- RLS entirely, so it can read/update this table regardless of the policy
-- above — the policy only governs access from the app itself.
