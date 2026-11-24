-- Parent portal permission test. Run in the Supabase SQL editor: it creates two
-- throwaway parent logins, checks what each can see and do, then ROLLS BACK.
-- Every 'A: … leaks / other families' line must be 0 and every 'blocked' line blocked.
begin;
create temp table _r(n serial, k text, v text) on commit drop;
grant all on _r to authenticated, anon;
grant usage on sequence _r_n_seq to authenticated, anon;
-- two families that have students and invoices
create temp table _fam on commit drop as
  select c.id, row_number() over (order by c.id) rn from customers c
  where exists (select 1 from students s where s.customer_id = c.id and coalesce(s.status,'active') <> 'withdrawn')
    and exists (select 1 from invoices i where i.customer_id = c.id)
  order by c.id limit 2;
grant select on _fam to authenticated, anon;
-- throwaway parent logins (the new-user trigger should make them 'parent')
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-test-' || rn || '@example.invalid',
       jsonb_build_object('portal_role', 'parent', 'customer_id', id), '{}'::jsonb, now(), now() from _fam;
create temp table _p on commit drop as
  select u.id uid, f.id fam, f.rn from auth.users u join _fam f on u.email = 'rls-test-' || f.rn || '@example.invalid';
grant select on _p to authenticated, anon;
insert into _r(k, v) select 'trigger made parent profiles', count(*)::text from profiles p join _p on p.id = _p.uid where p.role = 'parent' and p.customer_id = _p.fam;
-- expected counts for family A (as the database owner)
insert into _r(k, v) select 'EXPECT A invoices', count(*)::text from invoices where customer_id = (select fam from _p where rn = 1);
insert into _r(k, v) select 'EXPECT A students', count(*)::text from students where customer_id = (select fam from _p where rn = 1) and coalesce(status,'active') <> 'withdrawn';
insert into _r(k, v) select 'EXPECT A attendance', count(*)::text from attendance where student_id in (select id from students where customer_id = (select fam from _p where rn = 1));
insert into _r(k, v) select 'EXPECT total invoices', count(*)::text from invoices;

-- ── act as parent A ──
select set_config('request.jwt.claims', json_build_object('sub', (select uid from _p where rn = 1), 'role', 'authenticated', 'email', 'rls-test-1@example.invalid')::text, true);
set local role authenticated;
insert into _r(k, v) select 'A: students (direct)', count(*)::text from students;
insert into _r(k, v) select 'A: customers (direct)', count(*)::text from customers;
insert into _r(k, v) select 'A: invoices', count(*)::text from invoices;
insert into _r(k, v) select 'A: invoices of other families', count(*)::text from invoices where customer_id is distinct from (select fam from _p where rn = 1);
insert into _r(k, v) select 'A: invoice_summary', count(*)::text from invoice_summary;
insert into _r(k, v) select 'A: invoice_lines other fam', count(*)::text from invoice_lines l join invoices i on i.id = l.invoice_id where i.customer_id is distinct from (select fam from _p where rn = 1);
insert into _r(k, v) select 'A: payments other fam', count(*)::text from invoice_payments where customer_id is distinct from (select fam from _p where rn = 1);
insert into _r(k, v) select 'A: attendance', count(*)::text from attendance;
insert into _r(k, v) select 'A: tapes', count(*)::text from student_tapes;
insert into _r(k, v) select 'A: other-table leaks', (
  (select count(*) from leads) + (select count(*) from tryouts) + (select count(*) from makeup_records) + (select count(*) from payments)
  + (select count(*) from private_packages) + (select count(*) from invoice_settings) + (select count(*) from belt_tests)
  + (select count(*) from email_queue) + (select count(*) from dashboard_notes) + (select count(*) from registrations)
  + (select count(*) from fee_items) + (select count(*) from payslips) + (select count(*) from payroll_employees)
  + (select count(*) from student_black_belt) + (select count(*) from belt_test_entries) + (select count(*) from absence_notices where customer_id is distinct from (select fam from _p where rn = 1))
  + (select count(*) from profiles where id <> (select uid from _p where rn = 1)) + (select count(*) from event_signups where customer_id is distinct from (select fam from _p where rn = 1))
  + (select count(*) from inventory_movements) + (select count(*) from customer_balances where customer_id is distinct from (select fam from _p where rn = 1))
)::text;
insert into _r(k, v) select 'A: portal_data family is A', ((parent_portal_data()->'family'->>'id')::uuid = (select fam from _p where rn = 1))::text;
insert into _r(k, v) select 'A: portal_data students', jsonb_array_length(parent_portal_data()->'students')::text;
do $$ begin perform event_signup(gen_random_uuid(), array[gen_random_uuid()]); insert into _r(k,v) values ('A: signup bogus event', 'NO ERROR'); exception when others then insert into _r(k,v) values ('A: signup bogus event', 'blocked: ' || sqlerrm); end $$;
reset role;
-- B's student id (as owner)
create temp table _bs on commit drop as select id from students where customer_id = (select fam from _p where rn = 2) limit 1;
grant select on _bs to authenticated;
insert into events (id, title, price, published) values ('11111111-1111-4111-8111-111111111111', 'RLS test event', 30, true);
set local role authenticated;
do $$ begin perform parent_report_absence((select id from _bs), current_date); insert into _r(k,v) values ('A: absence for B child', 'NO ERROR'); exception when others then insert into _r(k,v) values ('A: absence for B child', 'blocked: ' || sqlerrm); end $$;
do $$ begin perform event_signup('11111111-1111-4111-8111-111111111111', array[(select id from _bs)]); insert into _r(k,v) values ('A: event signup for B child', 'NO ERROR'); exception when others then insert into _r(k,v) values ('A: event signup for B child', 'blocked: ' || sqlerrm); end $$;
do $$ begin insert into attendance (student_id, date, class_name, status) values ((select id from _bs), current_date, 'x', 'present'); insert into _r(k,v) values ('A: write attendance', 'NO ERROR'); exception when others then insert into _r(k,v) values ('A: write attendance', 'blocked: ' || sqlerrm); end $$;
do $$ begin insert into invoices (customer_id, customer_name) values ((select fam from _p where rn = 1), 'x'); insert into _r(k,v) values ('A: write invoice', 'NO ERROR'); exception when others then insert into _r(k,v) values ('A: write invoice', 'blocked: ' || sqlerrm); end $$;
do $$ begin insert into email_queue (type, recipient_email, payload) values ('absence_check', 'x@example.invalid', '{}'); insert into _r(k,v) values ('A: queue email directly', 'NO ERROR'); exception when others then insert into _r(k,v) values ('A: queue email directly', 'blocked: ' || sqlerrm); end $$;
do $$ declare n int; begin update students set notes = notes where true; get diagnostics n = row_count; insert into _r(k,v) values ('A: update students rows', n::text); end $$;
do $$ declare n int; begin update profiles set role = 'admin' where id = (select uid from _p where rn = 1); get diagnostics n = row_count; insert into _r(k,v) values ('A: make self admin rows', n::text); exception when others then insert into _r(k,v) values ('A: make self admin', 'blocked: ' || sqlerrm); end $$;
-- A's own child: sign up works and the invoice is A's
do $$ declare r jsonb; begin r := event_signup('11111111-1111-4111-8111-111111111111', array[(select (jsonb_array_elements(parent_portal_data()->'students')->>'id')::uuid limit 1)]); insert into _r(k,v) values ('A: own child signup', r::text); exception when others then insert into _r(k,v) values ('A: own child signup', 'ERROR ' || sqlerrm); end $$;
insert into _r(k, v) select 'A: sees own signup + invoice', (select count(*) from event_signups)::text || ' signup / ' || (select count(*) from invoices where notes like 'Event: RLS test event%')::text || ' invoice';
-- ── act as parent B: must not see A's event invoice ──
select set_config('request.jwt.claims', json_build_object('sub', (select uid from _p where rn = 2), 'role', 'authenticated', 'email', 'rls-test-2@example.invalid')::text, true);
insert into _r(k, v) select 'B: sees A signup/invoice', (select count(*) from event_signups)::text || ' / ' || (select count(*) from invoices where notes like 'Event: RLS test event%')::text;
insert into _r(k, v) select 'B: portal_data family is B', ((parent_portal_data()->'family'->>'id')::uuid = (select fam from _p where rn = 2))::text;
-- ── anonymous ──
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin perform parent_portal_data(); insert into _r(k,v) values ('anon: portal_data', 'NO ERROR'); exception when others then insert into _r(k,v) values ('anon: portal_data', 'blocked: ' || sqlerrm); end $$;
insert into _r(k, v) select 'anon: invoices', count(*)::text from invoices;
-- ── staff login still works ──
reset role;
select set_config('request.jwt.claims', json_build_object('sub', (select id from profiles where role = 'staff' limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into _r(k, v) select 'staff: students', count(*)::text from students;
insert into _r(k, v) select 'staff: attendance > 0', (count(*) > 0)::text from attendance;
insert into _r(k, v) select 'staff: invoices (admin only)', count(*)::text from invoices;
reset role;
select k, v from _r order by n;
rollback;
