-- A copy of each group email goes once to the dojang's own email.
alter table email_broadcasts add column if not exists copy_sent_at timestamptz;
update email_broadcasts set copy_sent_at = coalesce(copy_sent_at, created_at);
