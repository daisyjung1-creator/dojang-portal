-- 047: Home — belt-test progress pacing + staff meeting reminders.
--
-- invoice_settings.test_pacing: the curriculum plan for one test cycle, as
--   [{ "label": "...", "weeks": n, "detail": "..." }] in teaching order. The
--   Home card scales it to the real time between tests.
-- invoice_settings.test_cycle_weeks: used to estimate the next test when none
--   is scheduled yet.
-- invoice_settings.meetings: recurring staff meetings, e.g. Leaders Club on the
--   2nd and 4th Friday at 4:30 pm. Each one emails the dojang a reminder (with a
--   one-tap WhatsApp link holding the group message) on the days in "remind"
--   (1 = the day before, 0 = the day of), from 9 am Edmonton time.

alter table invoice_settings add column if not exists test_pacing jsonb;
alter table invoice_settings add column if not exists test_cycle_weeks int not null default 12;
alter table invoice_settings add column if not exists meetings jsonb;

update invoice_settings set test_pacing = '[
  {"label":"Basics & new belt material","weeks":3,"detail":"Basic movements and kicks for the next belt"},
  {"label":"Poomsae","weeks":3,"detail":"Learn the new poomsae start to finish"},
  {"label":"Kicking & sparring drills","weeks":2,"detail":"Kicking counts and step sparring"},
  {"label":"Breaking","weeks":2,"detail":"Breaking techniques for the test"},
  {"label":"Review & mock test","weeks":2,"detail":"Run the whole test, fix weak spots"}
]'::jsonb
where id = 1 and test_pacing is null;

update invoice_settings set meetings = '[
  {"key":"leaders","name":"Leaders Club meeting","weekday":5,"weeks":[2,4],"time":"16:30","remind":[1,0],
   "message":"📣 Reminder: Leaders Club meeting is {day} at {time} at the dojang. Please be on time! — Master Daisy"},
  {"key":"instructor","name":"Instructor meeting","weekday":1,"weeks":[1,3],"time":"20:00","remind":[1,0],
   "message":"📣 Reminder: Instructor meeting is {day} at {time}. See you there! — Master Daisy"}
]'::jsonb
where id = 1 and meetings is null;

create table if not exists meeting_reminder_log (
  meeting_key text not null,
  meeting_date date not null,
  days_before int not null,
  sent_at timestamptz not null default now(),
  primary key (meeting_key, meeting_date, days_before)
);
alter table meeting_reminder_log enable row level security;
drop policy if exists "meeting_reminder_log admin" on meeting_reminder_log;
create policy "meeting_reminder_log admin" on meeting_reminder_log for all using (is_admin()) with check (is_admin());

create or replace function url_encode(p text) returns text
language plpgsql immutable as $$
declare
  b bytea := convert_to(coalesce(p, ''), 'UTF8');
  out text := '';
  c int;
begin
  for i in 0 .. length(b) - 1 loop
    c := get_byte(b, i);
    if (c between 48 and 57) or (c between 65 and 90) or (c between 97 and 122) or c in (45, 46, 95, 126) then
      out := out || chr(c);
    else
      out := out || '%' || upper(lpad(to_hex(c), 2, '0'));
    end if;
  end loop;
  return out;
end $$;

create or replace function meeting_reminders() returns int
language plpgsql security definer set search_path = public as $$
declare
  now_local timestamp := now() at time zone 'America/Edmonton';
  today date := now_local::date;
  s record;
  m jsonb;
  d int;
  target date;
  wk int;
  day_txt text;
  time_txt text;
  msg text;
  n int := 0;
begin
  if extract(hour from now_local) < 9 then return 0; end if;
  select * into s from invoice_settings where id = 1;
  if s.email is null or s.meetings is null then return 0; end if;
  for m in select * from jsonb_array_elements(s.meetings) loop
    for d in select (jsonb_array_elements_text(coalesce(m->'remind', '[1,0]'::jsonb)))::int loop
      target := today + d;
      wk := ((extract(day from target)::int - 1) / 7) + 1;
      continue when extract(dow from target)::int <> (m->>'weekday')::int;
      continue when not (m->'weeks') @> to_jsonb(wk);
      continue when exists (select 1 from meeting_reminder_log where meeting_key = m->>'key' and meeting_date = target and days_before = d);
      insert into meeting_reminder_log (meeting_key, meeting_date, days_before) values (m->>'key', target, d);
      day_txt := case when d = 0 then 'today' when d = 1 then 'tomorrow' else '' end
                 || case when d <= 1 then ' (' else '' end
                 || to_char(target, 'FMDay, FMMonth FMDD')
                 || case when d <= 1 then ')' else '' end;
      time_txt := lower(to_char((m->>'time')::time, 'FMHH12:MI AM'));
      msg := replace(replace(coalesce(m->>'message', m->>'name'), '{day}', day_txt), '{time}', time_txt);
      insert into email_queue (type, recipient_email, payload) values (
        'broadcast', s.email,
        jsonb_build_object(
          'subject', format('Reminder: %s %s at %s — post to WhatsApp', m->>'name', case when d = 0 then 'today' else 'tomorrow' end, time_txt),
          'message', format(E'%s is %s at %s.\n\nPost this to the WhatsApp group:\n\n%s\n\nTap to open WhatsApp with the message ready (then pick the group):\nhttps://wa.me/?text=%s',
                            m->>'name', day_txt, time_txt, msg, url_encode(msg))
        )
      );
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;

revoke execute on function meeting_reminders() from public, anon, authenticated;

select cron.unschedule('meeting-reminders') where exists (select 1 from cron.job where jobname = 'meeting-reminders');
select cron.schedule('meeting-reminders', '5 * * * *', 'select meeting_reminders()');
