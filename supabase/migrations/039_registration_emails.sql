-- Online registrations email the family a PDF copy of the signed agreement and
-- the dojang a heads-up (Edge Function registration-emails).
alter table public.registrations add column if not exists emailed_at timestamptz;
alter table public.registrations add column if not exists email_error text;
update public.registrations set emailed_at = created_at where emailed_at is null; -- earlier tests: not emailed

create or replace function public.notify_registration_emails()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'https://eihgzlbuldejcmqcomub.supabase.co/functions/v1/registration-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpaGd6bGJ1bGRlamNtcWNvbXViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwNDMwMDcsImV4cCI6MjEwODYxOTAwN30.WV69280PWP5cfnN5OSQpoxWn7Gg7tcx8Tq-AtH-X6E4'
    ),
    body := jsonb_build_object('id', new.id),
    timeout_milliseconds := 15000
  );
  return new;
end $$;
revoke execute on function public.notify_registration_emails() from public, anon, authenticated;

drop trigger if exists registrations_email on public.registrations;
create trigger registrations_email after insert on public.registrations
  for each row execute function public.notify_registration_emails();

-- The public form can't mark a registration as already emailed.
drop policy if exists "registrations public insert" on public.registrations;
create policy "registrations public insert" on public.registrations
  for insert to anon, authenticated
  with check (status = 'new' and student_ids is null and handled_at is null and emailed_at is null and signature_name is not null and length(signature_name) between 2 and 120);
