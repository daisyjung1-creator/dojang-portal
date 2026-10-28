-- Sends queued emails automatically: whenever a row is added to email_queue or
-- welcome_queue, call the send-emails Edge Function with that row's id.
-- (Replaces the manual "Database Webhook" setup described in the README.)
--
-- The function looks the row up itself and only sends rows still marked
-- unsent, so the request carries nothing but the table name and row id.
-- The key below is the project's public anon key (the same one the website
-- uses); it only lets the call through the function's JWT check.
--
-- If you move to a different Supabase project, update the URL and key.

create extension if not exists pg_net;

create or replace function public.notify_send_emails()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://eihgzlbuldejcmqcomub.supabase.co/functions/v1/send-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpaGd6bGJ1bGRlamNtcWNvbXViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwNDMwMDcsImV4cCI6MjEwODYxOTAwN30.WV69280PWP5cfnN5OSQpoxWn7Gg7tcx8Tq-AtH-X6E4'
    ),
    body := jsonb_build_object('table', tg_table_name, 'record', jsonb_build_object('id', new.id)),
    timeout_milliseconds := 10000
  );
  return new;
end;
$$;

revoke execute on function public.notify_send_emails() from public, anon, authenticated;

drop trigger if exists email_queue_send on email_queue;
create trigger email_queue_send after insert on email_queue
  for each row execute function public.notify_send_emails();

drop trigger if exists welcome_queue_send on welcome_queue;
create trigger welcome_queue_send after insert on welcome_queue
  for each row execute function public.notify_send_emails();

-- Tidy-ups from the Supabase security advisor: trigger-only functions
-- shouldn't be callable over the API.
revoke execute on function public.assign_invoice_number() from public, anon, authenticated;
revoke execute on function public.assign_receipt_number() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
alter function public.touch_updated_at() set search_path = public;
