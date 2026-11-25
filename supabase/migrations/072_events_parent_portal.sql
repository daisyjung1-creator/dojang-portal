-- 072: Events (camps, tournaments, movie nights…) and the parent portal.
--
-- Parents get their own logins (role 'parent', linked to one family =
-- customers row). Until now several tables let ANY signed-in user read or
-- write ("auth.uid() is not null"); that was fine with only the admin and the
-- front-desk login, but a parent must never see another family. So those
-- policies are narrowed to portal staff (admin + staff login), and parents get
-- read-only policies limited to their own family. Everything a parent changes
-- (event sign-up, absence notice, message to the dojang) goes through the
-- checked functions at the bottom, never straight into a table.

-- ── 1. Who is who ─────────────────────────────────────────────────────────
alter table profiles add column if not exists customer_id uuid references customers(id) on delete set null;
alter table customers add column if not exists portal_invited_at timestamptz;

create or replace function my_customer_id() returns uuid
language sql stable security definer set search_path = public as $$
  select customer_id from profiles where id = auth.uid() and role = 'parent';
$$;

create or replace function my_student_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select s.id from students s where s.customer_id is not null and s.customer_id = (select customer_id from profiles where id = auth.uid() and role = 'parent');
$$;

-- New logins: a parent login is created by the parent-portal function with
-- app_metadata (which only the server can set) — everyone else stays 'staff'
-- as before.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.raw_app_meta_data->>'portal_role' = 'parent' and (new.raw_app_meta_data->>'customer_id') is not null then
    insert into public.profiles (id, name, role, customer_id)
    values (new.id, new.raw_user_meta_data->>'name', 'parent', (new.raw_app_meta_data->>'customer_id')::uuid);
  else
    insert into public.profiles (id, name, role) values (new.id, new.raw_user_meta_data->>'name', 'staff');
  end if;
  return new;
end;
$$;

-- The admin can see who has a login (for "Parent portal: invited / active").
create policy "profiles admin read" on profiles for select using (is_admin());

-- ── 2. Narrow the "any signed-in user" policies to portal staff ───────────
alter policy "students select" on students using (is_portal_staff());
alter policy "attendance all" on attendance using (is_portal_staff()) with check (is_portal_staff());
alter policy "makeup all" on makeup_records using (is_portal_staff()) with check (is_portal_staff());
alter policy "payments select" on payments using (is_portal_staff());
alter policy "private_packages all" on private_packages using (is_portal_staff()) with check (is_portal_staff());
alter policy "invoice_settings read" on invoice_settings using (is_portal_staff());
alter policy "class_schedule read" on class_schedule using (is_portal_staff() or my_customer_id() is not null);
alter policy "class_cancellations all" on class_cancellations using (is_portal_staff()) with check (is_portal_staff());
alter policy "tryouts staff" on tryouts using (is_portal_staff());
alter policy "tryouts staff insert" on tryouts with check (is_portal_staff());
alter policy "tryouts staff update" on tryouts using (is_portal_staff()) with check (is_portal_staff());
alter policy "email_queue staff attendance emails" on email_queue
  with check (is_portal_staff() and type = any (array['makeup', 'absence_check', 'tryout_confirmation']));
alter policy "belt_tests staff read" on belt_tests using (is_portal_staff());
alter policy "belt_curriculum staff read" on belt_curriculum using (is_portal_staff());

create or replace function mark_absence_emailed(p_student uuid) returns void
language sql security definer set search_path = public as $$
  update students set absence_emailed_at = now() where id = p_student and is_portal_staff();
$$;

-- ── 3. Events ─────────────────────────────────────────────────────────────
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind text not null default 'other' check (kind in ('camp', 'tournament', 'movie_night', 'party', 'seminar', 'other')),
  description text,
  start_date date,
  end_date date,
  start_time time,
  end_time time,
  location text,
  price numeric(10, 2) not null default 0,
  taxable boolean not null default true,
  fee_item_id uuid references fee_items(id) on delete set null,
  signup_deadline date,
  capacity integer,
  published boolean not null default true,   -- shown in the parent portal
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
alter table events enable row level security;
create policy "events admin" on events for all using (is_admin()) with check (is_admin());
create policy "events parent read" on events for select using (my_customer_id() is not null and published and not archived);

create table if not exists event_signups (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  invoice_id uuid references invoices(id) on delete set null,
  status text not null default 'signed_up' check (status in ('signed_up', 'cancelled')),
  source text not null default 'admin' check (source in ('admin', 'parent')),
  note text,
  created_at timestamptz not null default now(),
  unique (event_id, student_id)
);
create index if not exists event_signups_event_idx on event_signups (event_id);
alter table event_signups enable row level security;
create policy "event_signups admin" on event_signups for all using (is_admin()) with check (is_admin());
create policy "event_signups parent read" on event_signups for select using (customer_id is not null and customer_id = my_customer_id());

-- ── 4. Parent read access (own family only) ───────────────────────────────
create policy "invoices parent read" on invoices for select using (customer_id is not null and customer_id = my_customer_id());
create policy "invoice_lines parent read" on invoice_lines for select
  using (exists (select 1 from invoices i where i.id = invoice_id and i.customer_id is not null and i.customer_id = my_customer_id()));
create policy "invoice_payments parent read" on invoice_payments for select
  using (customer_id is not null and customer_id = my_customer_id()
         or exists (select 1 from invoices i where i.id = invoice_id and i.customer_id is not null and i.customer_id = my_customer_id()));
create policy "invoice_refunds parent read" on invoice_refunds for select
  using (customer_id is not null and customer_id = my_customer_id()
         or exists (select 1 from invoices i where i.id = invoice_id and i.customer_id is not null and i.customer_id = my_customer_id()));
create policy "credit_applications parent read" on credit_applications for select using (customer_id is not null and customer_id = my_customer_id());
create policy "attendance parent read" on attendance for select using (student_id in (select my_student_ids()));
create policy "student_tapes parent read" on student_tapes for select using (student_id in (select my_student_ids()));
create policy "class_cancellations parent read" on class_cancellations for select using (my_customer_id() is not null);
-- students and customers are NOT opened to parents: they read their own
-- family through parent_portal_data(), which returns only the safe columns
-- (no internal notes, no payment-profile codes).

-- ── 5. Absence notices from parents ───────────────────────────────────────
create table if not exists absence_notices (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  absence_date date not null,
  class_name text,
  note text,
  created_at timestamptz not null default now(),
  handled_at timestamptz
);
alter table absence_notices enable row level security;
create policy "absence_notices staff" on absence_notices for all using (is_portal_staff()) with check (is_portal_staff());
create policy "absence_notices parent read" on absence_notices for select using (customer_id is not null and customer_id = my_customer_id());

-- ── 6. Functions the parent portal (and Events tab) call ──────────────────

-- Sign students up for an event. One invoice for the family (event price per
-- student + GST), unless the event is free. Admin: any students of one family.
-- Parent: only their own children, published events, before the deadline.
create or replace function event_signup(p_event uuid, p_students uuid[], p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  e events;
  today date := (now() at time zone 'America/Edmonton')::date;
  admin boolean := is_admin();
  fam uuid;
  fams uuid[];
  c customers;
  new_ids uuid[];
  taken int;
  rate numeric;
  sub numeric := 0;
  tax_base numeric := 0;
  gst numeric;
  inv_id uuid;
  inv_no int;
  tok uuid;
  sid uuid;
  sname text;
  pos int := 0;
begin
  select * into e from events where id = p_event;
  if not found or e.archived then raise exception 'This event is not available.'; end if;
  if p_students is null or cardinality(p_students) = 0 then raise exception 'Choose at least one student.'; end if;
  if not admin then
    if my_customer_id() is null then raise exception 'Not allowed.'; end if;
    if not e.published then raise exception 'This event is not available.'; end if;
    if e.signup_deadline is not null and e.signup_deadline < today then raise exception 'Sign-up for this event has closed.'; end if;
    if coalesce(e.end_date, e.start_date) is not null and coalesce(e.end_date, e.start_date) < today then raise exception 'This event is over.'; end if;
    if exists (select 1 from unnest(p_students) x where x not in (select my_student_ids())) then raise exception 'Not allowed.'; end if;
  end if;

  select array_agg(distinct s.customer_id) into fams from students s where s.id = any (p_students);
  if fams is null or cardinality(fams) <> 1 or fams[1] is null then
    raise exception 'All students must belong to one family account.';
  end if;
  fam := fams[1];
  select * into c from customers where id = fam;

  -- skip anyone already signed up
  select array_agg(x) into new_ids from unnest(p_students) x
  where not exists (select 1 from event_signups es where es.event_id = p_event and es.student_id = x and es.status = 'signed_up');
  if new_ids is null then raise exception 'Already signed up.'; end if;

  if e.capacity is not null then
    select count(*) into taken from event_signups where event_id = p_event and status = 'signed_up';
    if taken + cardinality(new_ids) > e.capacity then
      raise exception 'Sorry, only % spot(s) left.', greatest(e.capacity - taken, 0);
    end if;
  end if;

  if e.price > 0 then
    select coalesce(gst_rate, 5) into rate from invoice_settings where id = 1;
    insert into invoices (customer_id, customer_name, customer_email, customer_address, invoice_date, due_date, gst_rate, notes)
    values (fam, c.name, c.email, nullif(concat_ws(E'\n', nullif(c.address, ''), nullif(c.printed_info, '')), ''), today,
            greatest(today, coalesce(e.signup_deadline, e.start_date, today)), rate,
            'Event: ' || e.title || coalesce(' (' || to_char(e.start_date, 'Mon DD, YYYY') || ')', ''))
    returning id, invoice_number, pay_token into inv_id, inv_no, tok;
    foreach sid in array new_ids loop
      select name into sname from students where id = sid;
      insert into invoice_lines (invoice_id, position, fee_item_id, student_id, item_name, description, quantity, unit_price, taxable, amount)
      values (inv_id, pos, e.fee_item_id, sid, e.title, e.title || ' - ' || sname, 1, e.price, e.taxable, e.price);
      pos := pos + 1;
      sub := sub + e.price;
      if e.taxable then tax_base := tax_base + e.price; end if;
    end loop;
    gst := round(tax_base * rate / 100, 2);
    update invoices set subtotal = round(sub, 2), gst_amount = gst, total = round(sub, 2) + gst where id = inv_id;
  end if;

  insert into event_signups (event_id, student_id, customer_id, invoice_id, status, source, note)
  select p_event, x, fam, inv_id, 'signed_up', case when admin then 'admin' else 'parent' end, nullif(btrim(coalesce(p_note, '')), '')
  from unnest(new_ids) x
  on conflict (event_id, student_id) do update set status = 'signed_up', invoice_id = excluded.invoice_id, customer_id = excluded.customer_id, source = excluded.source, note = excluded.note, created_at = now();

  if not admin then
    insert into dashboard_notes (note_date, body, link_tab)
    values (null, 'Event sign-up: ' || (select string_agg(name, ', ') from students where id = any (new_ids)) || ' → ' || e.title, 'events');
  end if;

  return jsonb_build_object('invoice_id', inv_id, 'invoice_number', inv_no, 'pay_token', tok,
                            'total', (select total from invoices where id = inv_id), 'signed_up', cardinality(new_ids));
end;
$$;

-- Everything the parent portal shows about the family, safe columns only.
create or replace function parent_portal_data() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  fam uuid := my_customer_id();
  today date := (now() at time zone 'America/Edmonton')::date;
begin
  if fam is null then raise exception 'Not a parent login.'; end if;
  return jsonb_build_object(
    'family', (select jsonb_build_object('id', c.id, 'name', c.name, 'email', c.email, 'phone', c.phone, 'address', c.address,
                 'payment_type', c.payment_type, 'card_last4', c.card_last4, 'card_expiry', c.card_expiry, 'card_type', c.card_type,
                 'card_saved', c.card_profile_code is not null, 'card_link_token', c.card_link_token,
                 'credit', coalesce((select credit from customer_credit cc where cc.customer_id = c.id), 0))
               from customers c where c.id = fam),
    'students', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', s.id, 'name', s.name, 'belt', coalesce(s.belt, 'White'), 'dob', s.dob, 'class_name', s.class_name, 'class_days', s.class_days,
                 'classes_per_week', s.classes_per_week, 'plan', s.plan, 'tuition', s.tuition, 'status', coalesce(s.status, 'active'),
                 'enroll_date', s.enroll_date, 'billing_start_date', s.billing_start_date, 'billing_end_date', s.billing_end_date,
                 'last_test_date', s.last_test_date, 'hold_from', s.hold_from, 'hold_until', s.hold_until, 'billing_exempt', s.billing_exempt,
                 'subsidy', s.subsidy, 'subsidy_name', s.subsidy_name, 'subsidy_amount', s.subsidy_amount, 'subsidy_end_date', s.subsidy_end_date,
                 'family_discount', s.family_discount) order by s.name)
               from students s where s.customer_id = fam and coalesce(s.status, 'active') <> 'withdrawn'), '[]'::jsonb),
    'schedule', coalesce((select jsonb_agg(jsonb_build_object('class_name', class_name, 'weekday', weekday, 'start_time', start_time, 'end_time', end_time) order by weekday, start_time)
               from class_schedule where active), '[]'::jsonb),
    'next_test', (select jsonb_build_object('date', test_date, 'title', title) from belt_tests where test_date >= today order by test_date limit 1),
    'business', (select jsonb_build_object('business_name', business_name, 'address', address, 'phone', phone, 'email', email, 'website', website,
                 'gst_number', gst_number, 'logo_data', logo_data, 'invoice_footer', invoice_footer, 'payment_instructions', payment_instructions)
               from invoice_settings where id = 1)
  );
end;
$$;

-- "My child will be absent": recorded for the dojang (Home To-do + email).
create or replace function parent_report_absence(p_student uuid, p_date date, p_class text default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  fam uuid := my_customer_id();
  today date := (now() at time zone 'America/Edmonton')::date;
  sname text;
  nid uuid;
  dojang text;
  who text := coalesce(auth.jwt()->>'email', '');
begin
  if fam is null or p_student not in (select my_student_ids()) then raise exception 'Not allowed.'; end if;
  if p_date is null or p_date < today - 1 or p_date > today + 90 then raise exception 'Pick a date between yesterday and the next 90 days.'; end if;
  if (select count(*) from absence_notices where customer_id = fam and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Too many notices today — please email the dojang.';
  end if;
  select name into sname from students where id = p_student;
  insert into absence_notices (student_id, customer_id, absence_date, class_name, note)
  values (p_student, fam, p_date, nullif(btrim(coalesce(p_class, '')), ''), left(nullif(btrim(coalesce(p_note, '')), ''), 500))
  returning id into nid;
  insert into dashboard_notes (note_date, body, link_tab, auto_key)
  values (p_date, 'Absence (parent): ' || sname || coalesce(' — ' || nullif(btrim(coalesce(p_class, '')), ''), '') || coalesce(' — "' || left(nullif(btrim(coalesce(p_note, '')), ''), 120) || '"', ''), 'attendance', 'absence:' || nid);
  select email into dojang from invoice_settings where id = 1;
  if dojang is not null then
    insert into email_queue (type, student_id, recipient_email, payload)
    values ('parent_notice', p_student, dojang, jsonb_build_object(
      'subject', 'Absence notice: ' || sname || ' — ' || to_char(p_date, 'Dy Mon DD'),
      'message', 'Parent portal: ' || sname || ' will be absent on ' || to_char(p_date, 'FMDay, Mon DD, YYYY')
                 || coalesce(' (' || nullif(btrim(coalesce(p_class, '')), '') || ')', '') || '.'
                 || coalesce(E'\n\nNote from the parent: ' || left(nullif(btrim(coalesce(p_note, '')), ''), 500), '')
                 || E'\n\nSent by ' || who,
      'reply_to', who));
  end if;
  return nid;
end;
$$;

-- "Email the dojang" from the parent portal (reply goes to the parent).
create or replace function parent_send_message(p_subject text, p_message text)
returns void language plpgsql security definer set search_path = public as $$
declare
  fam uuid := my_customer_id();
  dojang text;
  fname text;
  who text := coalesce(auth.jwt()->>'email', '');
begin
  if fam is null then raise exception 'Not allowed.'; end if;
  if length(btrim(coalesce(p_message, ''))) < 2 then raise exception 'Write a message first.'; end if;
  if (select count(*) from email_queue where type = 'parent_notice' and payload->>'family_id' = fam::text and created_at > now() - interval '1 day') >= 15 then
    raise exception 'Too many messages today — please call the dojang.';
  end if;
  select email into dojang from invoice_settings where id = 1;
  if dojang is null then raise exception 'The dojang email is not set up yet.'; end if;
  select name into fname from customers where id = fam;
  insert into email_queue (type, recipient_email, payload)
  values ('parent_notice', dojang, jsonb_build_object(
    'subject', '[Parent portal] ' || coalesce(nullif(left(btrim(coalesce(p_subject, '')), 120), ''), 'Message from ' || fname),
    'message', left(btrim(p_message), 4000) || E'\n\n— ' || fname || ' (' || who || '), sent from the parent portal',
    'reply_to', who,
    'family_id', fam));
end;
$$;

-- Signed-in users only (each function also checks who is calling).
revoke execute on function event_signup(uuid, uuid[], text) from public, anon;
revoke execute on function parent_portal_data() from public, anon;
revoke execute on function parent_report_absence(uuid, date, text, text) from public, anon;
revoke execute on function parent_send_message(text, text) from public, anon;
grant execute on function event_signup(uuid, uuid[], text) to authenticated;
grant execute on function parent_portal_data() to authenticated;
grant execute on function parent_report_absence(uuid, date, text, text) to authenticated;
grant execute on function parent_send_message(text, text) to authenticated;

-- ── 7. (072b) email types for the parent portal ───────────────────────────
-- parent_notice = absence notice / message from a parent to the dojang
-- parent_invite = invite or password reset link sent to a parent
alter table email_queue drop constraint if exists email_queue_type_check;
alter table email_queue add constraint email_queue_type_check check (type = any (array[
  'welcome', 'tryout_confirmation', 'invoice', 'receipt', 'refund', 'subsidy_reminder',
  'broadcast', 'makeup', 'absence_check', 'payslip', 'parent_notice', 'parent_invite'
]));

-- ── 8. (072c) allow the 'parent' role on profiles ─────────────────────────
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role = any (array['admin', 'staff', 'coach', 'parent']));

-- ── 9. (072d) parent messages; the parent-portal edge function sends the emails
create table if not exists parent_messages (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null,
  sender_email text,
  subject text,
  body text,
  created_at timestamptz not null default now()
);
alter table parent_messages enable row level security;
create policy "parent_messages admin" on parent_messages for all using (is_admin()) with check (is_admin());
create policy "parent_messages parent read" on parent_messages for select using (customer_id is not null and customer_id = my_customer_id());
-- parent_absence(p_student, p_date, p_class, p_note) returns jsonb: same checks as
-- parent_report_absence above, records the notice + Home To-do, returns
-- { id, student, family, dojang_email } (no email_queue row).
-- parent_log_message(p_subject, p_message) returns jsonb: checks + rate limit,
-- stores the message in parent_messages, returns { family, dojang_email }.
-- parent_report_absence / parent_send_message now just raise "Replaced".
-- (full bodies as applied: see migration 072d_parent_messages in Supabase)
