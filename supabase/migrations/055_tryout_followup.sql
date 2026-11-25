-- When the "would you like to join?" follow-up went out after a trial class.
alter table public.tryouts add column if not exists followup_sent_at timestamptz;
