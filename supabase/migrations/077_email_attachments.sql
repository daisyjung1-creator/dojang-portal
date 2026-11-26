-- 077: attachments on emails written in the portal (Email tab). The file is
-- stored once; each queued email lists the attachment ids in
-- payload.attachments and send-emails attaches them.
create table if not exists email_attachments (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  mime text not null,
  size_bytes int not null,
  data text not null,                -- base64 (no data: prefix)
  created_at timestamptz not null default now()
);
alter table email_attachments enable row level security;
create policy "email_attachments admin" on email_attachments for all using (is_admin()) with check (is_admin());

-- shown in the Email tab's history: [{ id, name, size }]
alter table email_broadcasts add column if not exists attachments jsonb not null default '[]'::jsonb;
