-- 086: Trials belong to an inquiry (lead). Booking a trial is an inquiry too,
-- so every trial is linked to a lead (tryouts.lead_id) and Leads & Trials is
-- one list. Lead status follows the trial:
--   booked → 'Consultation Scheduled' (shown as Trial Booked)
--   Attended → 'Consultation Done' (Trial Done), Converted → 'Enrolled',
--   Not joining → 'Not Enrolled'.
alter table tryouts add column if not exists lead_id uuid references leads(id) on delete set null;
create index if not exists tryouts_lead_id on tryouts (lead_id);

-- Link existing trials to the matching inquiry (same email or phone).
update tryouts t set lead_id = (
  select l.id from leads l
  where (t.guardian_email is not null and l.email is not null and lower(l.email) = lower(t.guardian_email))
     or (t.guardian_phone is not null and l.phone is not null and regexp_replace(l.phone, '\D', '', 'g') = regexp_replace(t.guardian_phone, '\D', '', 'g'))
  order by abs(l.inquiry_date - coalesce(t.date, l.inquiry_date)), l.created_at desc
  limit 1)
where t.lead_id is null;

-- A trial added without an inquiry gets one: the family's open inquiry
-- (same email/phone, not enrolled/closed) or a new one.
create or replace function tryouts_link_lead() returns trigger
language plpgsql security definer set search_path = public as $$
declare l_id uuid;
begin
  if new.lead_id is null then
    select l.id into l_id from leads l
    where l.status not in ('Enrolled', 'Not Enrolled')
      and ((new.guardian_email is not null and l.email is not null and lower(l.email) = lower(new.guardian_email))
        or (new.guardian_phone is not null and l.phone is not null and length(regexp_replace(new.guardian_phone, '\D', '', 'g')) >= 7
            and regexp_replace(l.phone, '\D', '', 'g') = regexp_replace(new.guardian_phone, '\D', '', 'g')))
    order by l.created_at desc limit 1;
    if l_id is null then
      insert into leads (student_name, guardian_name, phone, email, source, inquiry_date, consult_date, status, notes, student_age, children)
      values (new.student_name, new.guardian_name, new.guardian_phone, new.guardian_email, 'Phone',
              (now() at time zone 'America/Edmonton')::date, new.date, 'Consultation Scheduled', 'Trial booked',
              new.student_age, jsonb_build_array(jsonb_build_object('name', new.student_name, 'age', new.student_age)))
      returning id into l_id;
    else
      -- Add the child to that inquiry if they're not on it yet.
      update leads set
        children = case when coalesce(children, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('name', new.student_name)) then children
                        else coalesce(children, jsonb_build_array(jsonb_build_object('name', student_name, 'age', student_age))) || jsonb_build_array(jsonb_build_object('name', new.student_name, 'age', new.student_age)) end
      where id = l_id and new.student_name is not null;
    end if;
    new.lead_id := l_id;
  end if;
  update leads set status = 'Consultation Scheduled', consult_date = coalesce(least(consult_date, new.date), new.date)
  where id = new.lead_id and status = 'New Inquiry';
  return new;
end $$;
drop trigger if exists tryouts_link_lead on tryouts;
create trigger tryouts_link_lead before insert on tryouts for each row execute function tryouts_link_lead();

create or replace function tryouts_sync_lead_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.lead_id is null or new.status is not distinct from old.status then return new; end if;
  if new.status = 'Attended' then
    update leads set status = 'Consultation Done' where id = new.lead_id and status in ('New Inquiry', 'Consultation Scheduled');
  elsif new.status = 'Converted' then
    update leads set status = 'Enrolled' where id = new.lead_id and status <> 'Enrolled';
  elsif new.status = 'Not joining' then
    update leads set status = 'Not Enrolled' where id = new.lead_id and status not in ('Enrolled', 'Not Enrolled')
      and not exists (select 1 from tryouts t where t.lead_id = new.lead_id and t.id <> new.id and t.status not in ('Not joining', 'No-show'));
  end if;
  return new;
end $$;
drop trigger if exists tryouts_sync_lead_status on tryouts;
create trigger tryouts_sync_lead_status after update of status on tryouts for each row execute function tryouts_sync_lead_status();

-- Online booking (/trial): make the inquiry first, then the trials point at it.
create or replace function public.book_trial(p jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  k_name text; k_age int; k_date date; k_class text; k_time time; k_exp text;
  n int; slot_ok boolean;
  out jsonb := '[]'::jsonb;
  lead_children jsonb := '[]'::jsonb;
  first_date date;
  t_id uuid;
  l_id uuid;
  subj text; msg text;
begin
  select * into s from invoice_settings where id = 1;
  if length(g_name) < 2 or length(g_name) > 80 then raise exception 'Please enter your name.'; end if;
  if g_email = '' and g_phone = '' then raise exception 'Please enter an email address or a phone number.'; end if;
  if g_email <> '' and (g_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(g_email) > 120) then raise exception 'Please enter a valid email address.'; end if;
  if g_phone <> '' and (length(regexp_replace(g_phone, '\D', '', 'g')) < 7 or length(g_phone) > 30) then raise exception 'Please enter a valid phone number.'; end if;
  if jsonb_typeof(kids) <> 'array' or jsonb_array_length(kids) < 1 or jsonb_array_length(kids) > 4 then raise exception 'Please add 1 to 4 children.'; end if;
  select count(*) into n from tryouts where created_at > now() - interval '1 day'
    and ((g_email <> '' and lower(guardian_email) = g_email) or (g_phone <> '' and guardian_phone = g_phone));
  if n >= 6 then raise exception 'Too many bookings today — please call or email us.'; end if;

  insert into leads (student_name, guardian_name, phone, email, source, inquiry_date, status, notes)
    values (nullif(btrim(coalesce(kids->0->>'name', '')), ''), g_name, nullif(g_phone, ''), nullif(g_email, ''), 'Online', today, 'Consultation Scheduled', 'Trial booked online')
    returning id into l_id;

  for k in select * from jsonb_array_elements(kids) loop
    k_name := btrim(coalesce(k->>'name', ''));
    k_age := nullif(k->>'age', '')::int;
    k_date := nullif(k->>'date', '')::date;
    k_exp := coalesce(nullif(k->>'experience', ''), 'None');
    if k_exp not in ('None', 'Color belt', 'Black belt') then k_exp := 'None'; end if;
    if length(k_name) < 1 or length(k_name) > 60 then raise exception 'Please enter each child''s name.'; end if;
    if k_age is null or k_age < 3 or k_age > 80 then raise exception 'Please enter each child''s age.'; end if;
    k_class := case
      when k_exp = 'Black belt' then case when k->>'class' in ('Advance Poomsae', 'Advance Sparring') then k->>'class' else 'Advance Poomsae' end
      when k_age >= 12 then 'Intermediate B'
      when k_exp = 'Color belt' then 'Intermediate A'
      when k_age >= 11 then case when k->>'class' = 'Beginner' then 'Beginner' else 'Intermediate B' end else 'Beginner' end;
    if k_date is null then raise exception 'Please pick a trial date for %.', k_name; end if;
    slot_ok := false;
    select true, c.start_time into slot_ok, k_time
      from public_trial_slots() c where c.date = k_date and c.class_name = k_class and c.booked < c.capacity limit 1;
    if not coalesce(slot_ok, false) then raise exception 'Sorry, % on % is no longer available — please pick another date.', k_class, to_char(k_date, 'FMMon FMDD'); end if;

    insert into tryouts (lead_id, student_name, student_age, experience, guardian_name, guardian_phone, guardian_email, class_name, date, time, status, notes)
      values (l_id, k_name, k_age, k_exp, g_name, nullif(g_phone, ''), nullif(g_email, ''), k_class, k_date, k_time, 'Scheduled',
              'Booked online' || case when g_email = '' then ' · text the confirmation' else '' end || case when heard <> '' then ' · heard from: ' || heard else '' end || case when note <> '' then ' · ' || note else '' end)
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
    if g_email <> '' then
      insert into email_queue (type, recipient_email, payload)
        values ('tryout_confirmation', g_email, jsonb_build_object('subject', subj, 'message', msg, 'tryout_id', t_id));
    end if;

    lead_children := lead_children || jsonb_build_object('name', k_name, 'age', k_age, 'experience', k_exp);
    first_date := least(coalesce(first_date, k_date), k_date);
    out := out || jsonb_build_object('name', k_name, 'class', k_class, 'date', k_date, 'time', k_time);
  end loop;

  update leads set
    student_name = (select string_agg(c->>'name', ' & ') from jsonb_array_elements(lead_children) c),
    student_age = (lead_children->0->>'age')::int,
    children = lead_children,
    consult_date = first_date,
    notes = 'Trial booked online' || coalesce((select ' · experience: ' || string_agg((c->>'name') || ' ' || (c->>'experience'), ', ') from jsonb_array_elements(lead_children) c where c->>'experience' <> 'None'), '') || case when heard <> '' then ' · heard from: ' || heard else '' end || case when note <> '' then ' · ' || note else '' end
  where id = l_id;
  return jsonb_build_object('kids', out, 'emailed', g_email <> '');
end $function$;
