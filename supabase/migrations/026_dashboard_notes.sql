-- Notes on the Home page: a memo for a calendar day (note_date) or a general
-- note (no date). Admin only.
create table if not exists dashboard_notes (
  id uuid primary key default gen_random_uuid(),
  note_date date,
  body text not null,
  done boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists dashboard_notes_date on dashboard_notes (note_date);
alter table dashboard_notes enable row level security;
drop policy if exists "dashboard_notes admin" on dashboard_notes;
create policy "dashboard_notes admin" on dashboard_notes for all using (is_admin()) with check (is_admin());
