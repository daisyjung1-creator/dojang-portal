-- Billing ↔ invoices, attendance upgrades, family/staff flags, email templates.
--
--  * Students: classes per week, big-family discount, staff (never invoiced),
--    last absence-check email.
--  * Customers (families) and students share contact details: a new student is
--    linked to the family with the same email (or gets a new family), and
--    email / address / guardian name stay in sync both ways.
--  * Tuition invoices remember which student + billing cycle each line is for,
--    so Billing can tell what's been invoiced and paid. When a tuition invoice
--    is fully paid the old per-cycle `payments` row is filled in automatically,
--    which keeps makeup-class expiry dates working as before.
--  * Attendance: Double class, Private (with minutes) and Vacation, plus
--    private-lesson packages.
--  * Email templates for tuition reminders, makeup classes, absence checks and
--    trial bookings.

-- ── Students ────────────────────────────────────────────────────────────
alter table students add column if not exists classes_per_week int check (classes_per_week between 1 and 7);
alter table students add column if not exists family_discount boolean not null default false;
alter table students add column if not exists billing_exempt boolean not null default false;   -- coach / instructor
alter table students add column if not exists absence_emailed_at timestamptz;

-- ── Customers (families) ────────────────────────────────────────────────
alter table customers add column if not exists separate_invoices boolean not null default false;

-- ── Invoices ────────────────────────────────────────────────────────────
alter table invoice_lines add column if not exists cycle_start date;
alter table invoice_lines add column if not exists line_kind text check (line_kind in ('tuition', 'discount', 'subsidy'));
create index if not exists invoice_lines_cycle_idx on invoice_lines (student_id, cycle_start);
alter table invoices add column if not exists reminded_at timestamptz;

-- ── Settings ────────────────────────────────────────────────────────────
alter table invoice_settings add column if not exists invoice_lead_days int not null default 7;
alter table invoice_settings add column if not exists reminder_lead_days int not null default 3;
alter table invoice_settings add column if not exists family_discount_pct numeric not null default 20;
alter table invoice_settings add column if not exists default_tryout_time time not null default '16:30';
alter table invoice_settings add column if not exists reminder_subject text default 'Reminder: tuition payment on {due_date}';
alter table invoice_settings add column if not exists reminder_message text default
     'Hi {customer},' || chr(10) || chr(10)
  || 'This is a friendly reminder that your tuition payment of {balance} (invoice #{number}) will be charged to your credit card on file on {due_date}.' || chr(10) || chr(10)
  || 'If anything has changed with your card or your schedule, please let us know before then.' || chr(10) || chr(10)
  || 'Best Regards,' || chr(10) || 'Master Daisy';
alter table invoice_settings add column if not exists makeup_subject text default 'Makeup class for {student}';
alter table invoice_settings add column if not exists makeup_message text default
     'Hello {guardian},' || chr(10) || chr(10)
  || 'We missed {student} in class on {absence_date}. {student} can make up this class in any suitable class until {expiration_date}.' || chr(10) || chr(10)
  || 'Please let us know which day works for you and we''ll book it in.' || chr(10) || chr(10)
  || 'Best Regards,' || chr(10) || 'Master Daisy';
alter table invoice_settings add column if not exists makeup_reserved_message text default
     'Hello {guardian},' || chr(10) || chr(10)
  || 'This confirms {student}''s makeup class on {reservation_date} ({reservation_class}) for the class missed on {absence_date}.' || chr(10) || chr(10)
  || 'See you on the mat!' || chr(10) || chr(10)
  || 'Best Regards,' || chr(10) || 'Master Daisy';
alter table invoice_settings add column if not exists absence_subject text default 'We miss {student}!';
alter table invoice_settings add column if not exists absence_message text default
     'Hello {guardian},' || chr(10) || chr(10)
  || 'We haven''t seen {student} in class for a little while (last class: {last_attended}) and just wanted to check in. Is everything okay?' || chr(10) || chr(10)
  || 'If {student} has been sick or away, no problem at all. Missed classes can be made up within 30 days. Just let us know which day works for you.' || chr(10) || chr(10)
  || 'We look forward to seeing {student} back on the mat soon!' || chr(10) || chr(10)
  || 'Best Regards,' || chr(10) || 'Master Daisy';
alter table invoice_settings add column if not exists tryout_subject text default 'Trial class confirmed for {student}';
alter table invoice_settings add column if not exists tryout_message text default
     'Hello,' || chr(10) || chr(10)
  || 'This confirms {student}''s trial class at {business}:' || chr(10) || chr(10)
  || 'Date: {date}' || chr(10)
  || 'Time: {time}' || chr(10)
  || 'Class: {class}' || chr(10)
  || 'Location: {address}' || chr(10) || chr(10)
  || 'Please arrive about 10 minutes early and wear comfortable clothes (t-shirt and track pants). Bring a water bottle.' || chr(10) || chr(10)
  || 'If you need to change the time, just reply to this email or call us at {phone}.' || chr(10) || chr(10)
  || 'Best Regards,' || chr(10) || 'Master Daisy';

-- ── Tryouts: usual time 4:30 pm ─────────────────────────────────────────
alter table tryouts alter column time set default '16:30';

-- ── Attendance: more kinds ──────────────────────────────────────────────
alter table attendance drop constraint if exists attendance_status_check;
alter table attendance add constraint attendance_status_check check (status in ('present', 'absent', 'double', 'private', 'vacation'));
alter table attendance add column if not exists minutes int;               -- private lessons: 30, 60, …
alter table makeup_records add column if not exists emailed_at timestamptz;

-- Private lesson packages (usually 5 × 30 min = 150 min). Sessions are the
-- attendance rows with status 'private'; remaining = bought − used minutes.
create table if not exists private_packages (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  purchased_date date not null default current_date,
  total_minutes int not null default 150 check (total_minutes > 0),
  notes text,
  created_at timestamptz not null default now()
);
alter table private_packages enable row level security;
drop policy if exists "private_packages all" on private_packages;
create policy "private_packages all" on private_packages for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- ── Email queue: new kinds; staff may send makeup / absence emails ──────
alter table email_queue drop constraint if exists email_queue_type_check;
alter table email_queue add constraint email_queue_type_check check (type in ('welcome', 'tryout_confirmation', 'invoice', 'receipt', 'refund', 'subsidy_reminder', 'broadcast', 'makeup', 'absence_check'));
drop policy if exists "email_queue staff attendance emails" on email_queue;
create policy "email_queue staff attendance emails" on email_queue for insert
  with check (auth.uid() is not null and type in ('makeup', 'absence_check'));

-- Staff can't edit students, so the "absence email sent" stamp goes through this.
create or replace function mark_absence_emailed(p_student uuid)
returns void language sql security definer set search_path = public as $$
  update students set absence_emailed_at = now() where id = p_student and auth.uid() is not null;
$$;
revoke all on function mark_absence_emailed(uuid) from public, anon;
grant execute on function mark_absence_emailed(uuid) to authenticated;

-- ── Families ↔ students: link and keep contact details in sync ──────────
create or replace function first_email(v text) returns text language sql immutable as $$
  select nullif(lower((regexp_split_to_array(trim(coalesce(v, '')), '[,;\s]+'))[1]), '');
$$;

create or replace function students_link_customer() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  e text := first_email(new.guardian_email);
  cid uuid;
begin
  if new.customer_id is not null or coalesce(new.status, 'active') = 'withdrawn' then
    return new;
  end if;
  -- Taken out of a family on purpose (Customers → Edit): leave it that way.
  if tg_op = 'UPDATE' and old.customer_id is not null then
    return new;
  end if;
  if e is not null then
    select c.id into cid from customers c
    where e = any (regexp_split_to_array(lower(coalesce(c.email, '')), '[,;\s]+'))
    order by c.created_at limit 1;
  end if;
  if cid is null then
    insert into customers (name, contact_name, email, phone, address)
    values (new.name, new.guardian_name, new.guardian_email, new.guardian_phone, new.address)
    returning id into cid;
  end if;
  new.customer_id := cid;
  return new;
end $$;

drop trigger if exists students_link_customer on students;
create trigger students_link_customer before insert or update of guardian_email, customer_id, status on students
  for each row execute function students_link_customer();

-- Student → family: push only the fields that changed on this student.
create or replace function students_sync_to_customer() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.customer_id is null then return new; end if;
  if new.guardian_email is distinct from old.guardian_email then
    update customers set email = new.guardian_email where id = new.customer_id and email is distinct from new.guardian_email;
  end if;
  if new.address is distinct from old.address then
    update customers set address = new.address where id = new.customer_id and address is distinct from new.address;
  end if;
  if new.guardian_name is distinct from old.guardian_name then
    update customers set contact_name = new.guardian_name where id = new.customer_id and contact_name is distinct from new.guardian_name;
  end if;
  return new;
end $$;

drop trigger if exists students_sync_to_customer on students;
create trigger students_sync_to_customer after update of guardian_email, address, guardian_name on students
  for each row execute function students_sync_to_customer();

-- Family → its students.
create or replace function customers_sync_to_students() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then
    update students set guardian_email = new.email where customer_id = new.id and guardian_email is distinct from new.email;
  end if;
  if new.address is distinct from old.address then
    update students set address = new.address where customer_id = new.id and address is distinct from new.address;
  end if;
  if new.contact_name is distinct from old.contact_name then
    update students set guardian_name = new.contact_name where customer_id = new.id and guardian_name is distinct from new.contact_name;
  end if;
  return new;
end $$;

drop trigger if exists customers_sync_to_students on customers;
create trigger customers_sync_to_students after update of email, address, contact_name on customers
  for each row execute function customers_sync_to_students();

-- ── Tuition invoice paid → per-cycle payment + makeup expiry ────────────
create or replace function sync_tuition_status(p_invoice uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  inv record;
  ln record;
  is_paid boolean;
begin
  if p_invoice is null then return; end if;
  select i.voided, i.total, coalesce((select sum(amount) from invoice_payments where invoice_id = i.id), 0) as paid,
         (select max(payment_date) from invoice_payments where invoice_id = i.id) as last_paid
    into inv from invoices i where i.id = p_invoice;
  if not found then return; end if;
  is_paid := not inv.voided and inv.paid >= inv.total - 0.005;
  for ln in select distinct student_id, cycle_start, sum(amount) over (partition by student_id, cycle_start) as amt
            from invoice_lines where invoice_id = p_invoice and student_id is not null and cycle_start is not null and line_kind = 'tuition' loop
    if is_paid then
      insert into payments (student_id, cycle_start, paid, amount, paid_date)
      values (ln.student_id, ln.cycle_start, true, ln.amt, coalesce(inv.last_paid, current_date))
      on conflict (student_id, cycle_start) do update set paid = true, amount = excluded.amount, paid_date = excluded.paid_date;
      update makeup_records set conditional = false, expiration_date = tentative_expiration,
        status = case when status in ('reserved', 'completed') then status when tentative_expiration < current_date then 'expired' else 'pending' end
      where student_id = ln.student_id and next_billing_date = ln.cycle_start;
    else
      delete from payments where student_id = ln.student_id and cycle_start = ln.cycle_start;
      update makeup_records set conditional = true, expiration_date = tentative_expiration,
        status = case when status in ('reserved', 'completed') then status when tentative_expiration < current_date then 'expired' else 'pending' end
      where student_id = ln.student_id and next_billing_date = ln.cycle_start;
    end if;
  end loop;
end $$;
revoke all on function sync_tuition_status(uuid) from public, anon, authenticated;

create or replace function invoice_payments_sync_tuition() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then perform sync_tuition_status(new.invoice_id); end if;
  if tg_op in ('UPDATE', 'DELETE') and old.invoice_id is distinct from (case when tg_op = 'DELETE' then null else new.invoice_id end) then
    perform sync_tuition_status(old.invoice_id);
  end if;
  return null;
end $$;
drop trigger if exists invoice_payments_sync_tuition on invoice_payments;
create trigger invoice_payments_sync_tuition after insert or update or delete on invoice_payments
  for each row execute function invoice_payments_sync_tuition();

create or replace function invoices_sync_tuition() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform sync_tuition_status(new.id);
  return null;
end $$;
drop trigger if exists invoices_sync_tuition on invoices;
create trigger invoices_sync_tuition after update of voided, total on invoices
  for each row execute function invoices_sync_tuition();

-- ── One-time: put every current student into a family ──────────────────
-- 1) Students not marked as a sibling: link by email (or create a family).
update students set status = status where customer_id is null and coalesce(notes, '') not ilike '%sibling of %';
-- 2) Siblings join the family of the student named in "Sibling of …".
update students s set customer_id = p.customer_id
from students p
where s.customer_id is null and p.customer_id is not null
  and s.notes ilike '%sibling of ' || p.name || '%';
-- 3) Anyone left (sibling note didn't match a name): link by email / own family.
update students set status = status where customer_id is null;
-- 4) Family email = every email used by its children; family name = the children.
update customers c set
  email = coalesce((select string_agg(distinct e, ', ') from students s, regexp_split_to_table(lower(coalesce(s.guardian_email, '')), '[,;\s]+') e
                    where s.customer_id = c.id and e <> ''), c.email),
  name = (select string_agg(s.name, ' & ' order by s.created_at, s.name) from students s where s.customer_id = c.id)
where exists (select 1 from students s where s.customer_id = c.id)
  and c.id not in (select customer_id from invoices where customer_id is not null);

-- Staff need the business details and email wording for makeup / absence emails.
drop policy if exists "invoice_settings read" on invoice_settings;
create policy "invoice_settings read" on invoice_settings for select using (auth.uid() is not null);
