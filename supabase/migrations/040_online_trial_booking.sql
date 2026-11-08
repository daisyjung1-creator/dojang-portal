-- Online trial booking: families pick a trial date at /trial (no login).
-- Age 10 and under → Beginner, 11 and up → Intermediate B. Each booking adds
-- a lead (source Online) and a trial per child, and queues the usual trial
-- confirmation email (the dojang gets a BCC copy).

alter table public.invoice_settings add column if not exists trial_capacity int not null default 3;   -- trials per class session
alter table public.invoice_settings add column if not exists trial_days_ahead int not null default 21; -- how far ahead families can book

-- Trial sessions families can pick: the next N days (from tomorrow), with how
-- many trials are already booked. Cancelled classes are left out.
create or replace function public.public_trial_slots()
returns table (date date, class_name text, start_time time, end_time time, booked int, capacity int)
language sql stable security definer set search_path = public as $$
  with s as (select coalesce(trial_capacity, 3) cap, coalesce(trial_days_ahead, 21) days from invoice_settings where id = 1),
  today as (select (now() at time zone 'America/Edmonton')::date d)
  select g::date, c.class_name, c.start_time, c.end_time,
    (select count(*)::int from tryouts t where t.date = g::date and t.class_name = c.class_name and t.status <> 'Cancelled'),
    (select cap from s)
  from today, generate_series((select d from today) + 1, (select d from today) + (select days from s), interval '1 day') g
  join class_schedule c on c.active and c.weekday = extract(dow from g)::int and c.class_name in ('Beginner', 'Intermediate B')
  where not exists (select 1 from class_cancellations x where x.date = g::date and (x.class_name is null or x.class_name = c.class_name))
  order by 1, 3;
$$;
revoke all on function public.public_trial_slots() from public;
grant execute on function public.public_trial_slots() to anon, authenticated;

create or replace function public.book_trial(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s record;
  today date := (now() at time zone 'America/Edmonton')::date;
  g_name text := btrim(coalesce(p->>'guardian_name', ''));
  g_email text := lower(btrim(coalesce(p->>'email', '')));
  g_phone text := btrim(coalesce(p->>'phone', ''));
  heard text := left(btrim(coalesce(p->>'heard', '')), 60);
  note text := left(btrim(coalesce(p->>'notes', '')), 500);
  kids jsonb := coalesce(p->'kids', '[]'::jsonb);
  k jsonb;
  k_name text; k_age int; k_date date; k_class text; k_time time;
  n int; slot_ok boolean;
  out jsonb := '[]'::jsonb;
  lead_children jsonb := '[]'::jsonb;
  first_date date;
  t_id uuid;
  subj text; msg text;
begin
  select * into s from invoice_settings where id = 1;
  if length(g_name) < 2 or length(g_name) > 80 then raise exception 'Please enter your name.'; end if;
  if g_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(g_email) > 120 then raise exception 'Please enter a valid email address.'; end if;
  if length(regexp_replace(g_phone, '\D', '', 'g')) < 7 or length(g_phone) > 30 then raise exception 'Please enter a valid phone number.'; end if;
  if jsonb_typeof(kids) <> 'array' or jsonb_array_length(kids) < 1 or jsonb_array_length(kids) > 4 then raise exception 'Please add 1 to 4 children.'; end if;
  -- Light spam guard: a handful of bookings per email per day.
  select count(*) into n from tryouts where lower(guardian_email) = g_email and created_at > now() - interval '1 day';
  if n >= 6 then raise exception 'Too many bookings today — please call or email us.'; end if;

  for k in select * from jsonb_array_elements(kids) loop
    k_name := btrim(coalesce(k->>'name', ''));
    k_age := nullif(k->>'age', '')::int;
    k_date := nullif(k->>'date', '')::date;
    if length(k_name) < 1 or length(k_name) > 60 then raise exception 'Please enter each child''s name.'; end if;
    if k_age is null or k_age < 3 or k_age > 80 then raise exception 'Please enter each child''s age.'; end if;
    k_class := case when k_age >= 11 then 'Intermediate B' else 'Beginner' end;
    if k_date is null then raise exception 'Please pick a trial date for %.', k_name; end if;
    select true, c.start_time into slot_ok, k_time
      from public_trial_slots() c where c.date = k_date and c.class_name = k_class and c.booked < c.capacity limit 1;
    if not coalesce(slot_ok, false) then raise exception 'Sorry, % on % is no longer available — please pick another date.', k_class, to_char(k_date, 'FMMon FMDD'); end if;

    insert into tryouts (student_name, guardian_phone, guardian_email, class_name, date, time, status, notes)
      values (k_name, g_phone, g_email, k_class, k_date, k_time, 'Scheduled',
              'Booked online · age ' || k_age || case when note <> '' then ' · ' || note else '' end)
      returning id into t_id;

    subj := replace(coalesce(s.tryout_subject, 'Trial class confirmed for {student}'), '{student}', split_part(k_name, ' ', 1));
    msg := coalesce(nullif(s.tryout_message, ''), E'Hello,\n\nThis confirms {student}''s trial class at {business}:\n\nDate: {date}\nTime: {time}\nClass: {class}\n\nBest Regards,\nMaster Daisy');
    msg := replace(replace(replace(replace(replace(replace(replace(replace(msg,
      '{student_full}', k_name), '{student}', split_part(k_name, ' ', 1)),
      '{date}', to_char(k_date, 'FMDay, FMMonth FMDD, YYYY')),
      '{time}', lower(to_char(k_time, 'FMHH12:MI am'))),
      '{class}', k_class), '{business}', coalesce(s.business_name, '')),
      '{address}', coalesce(s.address, '')), '{phone}', coalesce(s.phone, ''));
    msg := msg || E'\n\nReady to join after the trial? You can register online here: https://dojang-portal.netlify.app/join';
    insert into email_queue (type, recipient_email, payload)
      values ('tryout_confirmation', g_email, jsonb_build_object('subject', subj, 'message', msg, 'tryout_id', t_id));

    lead_children := lead_children || jsonb_build_object('name', k_name, 'age', k_age);
    first_date := least(coalesce(first_date, k_date), k_date);
    out := out || jsonb_build_object('name', k_name, 'class', k_class, 'date', k_date, 'time', k_time);
  end loop;

  insert into leads (student_name, guardian_name, phone, email, source, inquiry_date, consult_date, status, notes, student_age, children)
    values (lead_children->0->>'name', g_name, g_phone, g_email, 'Online', today, first_date, 'Consultation Scheduled',
            'Trial booked online' || case when heard <> '' then ' · heard from: ' || heard else '' end || case when note <> '' then ' · ' || note else '' end,
            (lead_children->0->>'age')::int, lead_children);
  return out;
end $$;
revoke all on function public.book_trial(jsonb) from public;
grant execute on function public.book_trial(jsonb) to anon, authenticated;
