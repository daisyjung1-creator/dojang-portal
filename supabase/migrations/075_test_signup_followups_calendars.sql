-- 075: parents register for the next belt test (with the test-fee invoice),
-- "not seen lately" follow-ups, card-expiry notices (reviewed before sending)
-- and monthly calendars shown in the parent portal.

-- Home: "Not seen lately" — hide a student until this date after contacting the family.
alter table students add column if not exists followup_snooze_until date;

-- Card expiring: which expiry (MM/YY) the family was emailed about, and when.
alter table customers
  add column if not exists card_expiry_notice_for text,
  add column if not exists card_expiry_notice_at timestamptz;

-- Monthly calendars (image or PDF) for families.
create table if not exists monthly_calendars (
  month date primary key,              -- first day of the month
  title text,
  file_name text,
  mime text not null,
  file_data text not null,             -- data: URL
  uploaded_at timestamptz not null default now()
);
alter table monthly_calendars enable row level security;
create policy "monthly_calendars staff" on monthly_calendars for all using (is_portal_staff()) with check (is_portal_staff());
create policy "monthly_calendars parent read" on monthly_calendars for select using (my_customer_id() is not null);

-- Test fee item for the belt a student holds now (same table as lib/beltTesting.js).
create or replace function test_fee_item_for(p_belt text) returns text language sql immutable as $$
  select case coalesce(p_belt, 'White')
    when 'White' then 'Test Fee (Beg)' when 'Yellow Stripe' then 'Test Fee (Beg)' when 'Yellow' then 'Test Fee (Beg)'
    when 'Green Stripe' then 'Test Fee (Int)' when 'Green' then 'Test Fee (Int)'
    when 'Blue Stripe' then 'Test Fee (Int/Adv)' when 'Blue' then 'Test Fee (Int/Adv)'
    when 'Red Stripe' then 'Test Fee (Adv)' when 'Red' then 'Test Fee (Adv)'
    when 'Black Stripe' then 'Test Fee (Mini)' when 'Black Stripe 1' then 'Test Fee (Mini)'
    when 'Black Stripe 2' then 'Test Fee (Mini)' when 'Black Stripe 3' then 'Test Fee (Mini)'
    when 'Black Stripe 4' then 'Black Belt Testing' when 'Black Belt 1st Dan' then 'Black Belt Testing 2nd Degree'
    else 'Test Fee (Beg)' end
$$;

create or replace function next_belt_for(p_belt text) returns text language sql immutable as $$
  select coalesce((array['White','Yellow Stripe','Yellow','Green Stripe','Green','Blue Stripe','Blue','Red Stripe','Red',
    'Black Stripe','Black Stripe 1','Black Stripe 2','Black Stripe 3','Black Stripe 4','Black Belt 1st Dan','Black Belt 2nd Dan','Black Belt 3rd Dan'])
    [least(coalesce(array_position(array['White','Yellow Stripe','Yellow','Green Stripe','Green','Blue Stripe','Blue','Red Stripe','Red',
    'Black Stripe','Black Stripe 1','Black Stripe 2','Black Stripe 3','Black Stripe 4','Black Belt 1st Dan','Black Belt 2nd Dan','Black Belt 3rd Dan'], p_belt), 1) + 1, 17)], 'Yellow Stripe')
$$;

-- Classes since the last test: present = 1, double = 2 (as lib/attendanceStats.js).
create or replace function classes_since_test(p_student uuid) returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(case a.status when 'present' then 1 when 'double' then 2 else 0 end), 0)::int
  from attendance a join students s on s.id = a.student_id
  where a.student_id = p_student and a.date > coalesce(s.last_test_date, s.enroll_date, '2000-01-01')
$$;
revoke execute on function classes_since_test(uuid) from public, anon;

-- A parent registers a child for the next belt test. Only color belts up to
-- Black Stripe 3 (black belt tests are by invitation), 21+ classes since the
-- last test, membership not on a break. Creates the test-fee invoice (due on
-- the test day) and a to-do for the dojang.
create or replace function parent_test_register(p_student uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'America/Edmonton')::date;
  fam uuid := my_customer_id();
  s students;
  c customers;
  t belt_tests;
  fi fee_items;
  item text;
  n int;
  rate numeric;
  amt numeric;
  gst numeric;
  inv_id uuid;
  inv_no int;
  tok uuid;
begin
  if fam is null then raise exception 'Not allowed.'; end if;
  select * into s from students where id = p_student and customer_id = fam;
  if not found then raise exception 'Not allowed.'; end if;
  if coalesce(s.status, 'active') <> 'active' then raise exception 'Membership is not active.'; end if;
  if s.hold_from is not null and s.hold_from <= today and (s.hold_until is null or s.hold_until >= today) then
    raise exception 'Membership is on a break — please contact the dojang.';
  end if;
  if coalesce(s.belt, 'White') in ('Black Stripe 4', 'Black Belt 1st Dan', 'Black Belt 2nd Dan', 'Black Belt 3rd Dan') then
    raise exception 'Black belt testing is by invitation — please talk to Master Daisy.';
  end if;
  select * into t from belt_tests where test_date > today order by test_date limit 1;
  if not found then raise exception 'There is no belt test open for registration yet.'; end if;
  if exists (select 1 from belt_test_entries where test_id = t.id and student_id = s.id) then
    raise exception '% is already registered for this test.', s.name;
  end if;
  n := classes_since_test(s.id);
  if n < 21 then raise exception '% needs % more class(es) to be eligible.', s.name, 21 - n; end if;

  item := test_fee_item_for(coalesce(s.belt, 'White'));
  select * into fi from fee_items where name = item limit 1;
  amt := coalesce(fi.default_amount, 0);
  select * into c from customers where id = fam;

  insert into belt_test_entries (test_id, student_id, current_belt, target_belt, fee_item, fee_amount, result, notes)
  values (t.id, s.id, coalesce(s.belt, 'White'), next_belt_for(coalesce(s.belt, 'White')), item, amt, 'pending', 'Registered online by parent');

  if amt > 0 then
    select coalesce(gst_rate, 5) into rate from invoice_settings where id = 1;
    insert into invoices (customer_id, customer_name, customer_email, customer_address, invoice_date, due_date, gst_rate, notes)
    values (fam, c.name, c.email, nullif(concat_ws(E'\n', nullif(c.address, ''), nullif(c.printed_info, '')), ''), today, t.test_date, rate,
            'Belt test: ' || coalesce(t.title, to_char(t.test_date, 'Mon DD, YYYY')))
    returning id, invoice_number, pay_token into inv_id, inv_no, tok;
    insert into invoice_lines (invoice_id, position, fee_item_id, student_id, item_name, description, quantity, unit_price, taxable, amount)
    values (inv_id, 0, fi.id, s.id, item, coalesce(fi.description, item) || ' - ' || s.name || ' (' || coalesce(s.belt, 'White') || ' → ' || next_belt_for(coalesce(s.belt, 'White')) || ')',
            1, amt, coalesce(fi.taxable, true), amt);
    gst := case when coalesce(fi.taxable, true) then round(amt * rate / 100, 2) else 0 end;
    update invoices set subtotal = round(amt, 2), gst_amount = gst, total = round(amt, 2) + gst where id = inv_id;
  end if;

  insert into dashboard_notes (note_date, body, link_tab)
  values (null, 'Belt test registration (online): ' || s.name || ' (' || coalesce(s.belt, 'White') || ') → ' || to_char(t.test_date, 'Mon DD') || ' — check the test form', 'testing');

  return jsonb_build_object('invoice_id', inv_id, 'invoice_number', inv_no, 'pay_token', tok,
                            'total', (select total from invoices where id = inv_id), 'test_date', t.test_date);
end;
$$;
revoke execute on function parent_test_register(uuid) from public, anon;
grant execute on function parent_test_register(uuid) to authenticated;
