-- Group emails: send one message to every family, or to families in chosen
-- classes (e.g. Comp Team). Each family gets its own copy (nobody sees other
-- parents' addresses), queued in email_queue as type 'broadcast'.

create table if not exists email_broadcasts (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  message text not null,
  audience text,                 -- e.g. "All active students" or "Comp Team, HP"
  recipient_count int not null default 0,
  created_at timestamptz not null default now()
);
alter table email_broadcasts enable row level security;
drop policy if exists "email_broadcasts admin only" on email_broadcasts;
create policy "email_broadcasts admin only" on email_broadcasts for all using (is_admin()) with check (is_admin());

alter table email_queue add column if not exists broadcast_id uuid references email_broadcasts(id) on delete set null;
alter table email_queue add column if not exists error text;
create index if not exists email_queue_broadcast_idx on email_queue (broadcast_id);

alter table email_queue drop constraint if exists email_queue_type_check;
alter table email_queue add constraint email_queue_type_check
  check (type in ('welcome', 'tryout_confirmation', 'invoice', 'receipt', 'refund', 'subsidy_reminder', 'broadcast'));
