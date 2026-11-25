-- Belt test registration also needs all 7 curriculum tapes (colour belts).
-- A parent registers a child for the next belt test. Only color belts up to
-- Black Stripe 3 (black belt tests are by invitation), 21+ classes since the
-- last test, all 7 curriculum tapes (colour belts), membership not on a break. Creates the test-fee invoice (due on
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
  tp int;
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
  -- colour belts (White … Red) also need all 7 curriculum tapes for their belt
  if coalesce(s.belt, 'White') in ('White','Yellow Stripe','Yellow','Green Stripe','Green','Blue Stripe','Blue','Red Stripe','Red') then
    select count(distinct tape) into tp from student_tapes where student_id = s.id and belt = coalesce(s.belt, 'White');
    if tp < 7 then raise exception '% needs % more curriculum tape(s) to be eligible.', s.name, 7 - tp; end if;
  end if;

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
