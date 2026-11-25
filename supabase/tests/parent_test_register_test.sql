-- Belt-test registration + monthly calendars permission test. Creates two
-- throwaway parent logins, tries things as parent A, then ROLLS BACK.
begin;
create temp table _r(n serial, k text, v text) on commit drop;
grant all on _r to authenticated, anon;
grant usage on sequence _r_n_seq to authenticated, anon;
-- family A: one active color-belt student, made eligible inside this test
-- (21 fake classes, rolled back); family B: any other family with students
create temp table _cand on commit drop as
  select s.id sid, s.customer_id fam from students s
  where s.customer_id is not null and coalesce(s.status, 'active') = 'active' and s.hold_from is null
    and coalesce(s.belt, 'White') in ('Yellow', 'Green Stripe', 'Green', 'Blue Stripe')
    and not exists (select 1 from belt_test_entries e join belt_tests t on t.id = e.test_id where e.student_id = s.id and t.test_date > current_date)
  order by s.name limit 1;
insert into attendance (student_id, date, class_name, status)
select (select sid from _cand), d::date, 'RLS test', 'present' from generate_series(current_date - 60, current_date - 40, interval '1 day') d;
update students set last_test_date = current_date - 70 where id = (select sid from _cand);
create temp table _fam on commit drop as
  select fam id, 1 rn from _cand
  union all
  select * from (select c.id, 2 from customers c where c.id <> (select fam from _cand)
    and exists (select 1 from students s where s.customer_id = c.id and coalesce(s.status, 'active') = 'active') limit 1) x;
grant select on _fam, _cand to authenticated;
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-t-' || rn || '@example.invalid',
       jsonb_build_object('portal_role', 'parent', 'customer_id', id), '{}'::jsonb, now(), now() from _fam;
update profiles p set role = 'parent', customer_id = f.id from auth.users u join _fam f on u.email = 'rls-t-' || f.rn || '@example.invalid' where p.id = u.id;
create temp table _p on commit drop as select u.id uid, f.id fam, f.rn from auth.users u join _fam f on u.email = 'rls-t-' || f.rn || '@example.invalid';
grant select on _p to authenticated;
create temp table _bs on commit drop as select id from students where customer_id = (select fam from _p where rn = 2) limit 1;
grant select on _bs to authenticated;
insert into _r(k, v) select 'candidate student classes', classes_since_test(sid)::text from _cand;
insert into monthly_calendars (month, mime, file_data) values ('2099-01-01', 'image/png', 'data:image/png;base64,AAAA');

select set_config('request.jwt.claims', json_build_object('sub', (select uid from _p where rn = 1), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into _r(k, v) select 'A: calendars readable', count(*)::text from monthly_calendars where month = '2099-01-01';
do $$ begin insert into monthly_calendars (month, mime, file_data) values ('2099-02-01', 'image/png', 'x'); insert into _r(k,v) values ('A: insert calendar', 'NO ERROR'); exception when others then insert into _r(k,v) values ('A: insert calendar', 'blocked: ' || sqlerrm); end $$;
do $$ declare n int; begin update monthly_calendars set title = 'x'; get diagnostics n = row_count; insert into _r(k,v) values ('A: update calendar rows', n::text); end $$;
do $$ begin perform classes_since_test((select id from _bs)); insert into _r(k,v) values ('A: classes_since_test direct', 'NO ERROR'); exception when others then insert into _r(k,v) values ('A: classes_since_test direct', 'blocked: ' || sqlerrm); end $$;
do $$ declare n int; begin delete from monthly_calendars; get diagnostics n = row_count; insert into _r(k,v) values ('A: delete calendar rows', n::text); end $$;
do $$ begin perform parent_test_register((select id from _bs)); insert into _r(k,v) values ('A: register B child', 'NO ERROR'); exception when others then insert into _r(k,v) values ('A: register B child', 'blocked: ' || sqlerrm); end $$;
insert into _r(k, v) select 'A: register own child', parent_test_register((select sid from _cand))::text;
do $$ begin perform parent_test_register((select sid from _cand)); insert into _r(k,v) values ('A: register twice', 'NO ERROR'); exception when others then insert into _r(k,v) values ('A: register twice', 'blocked: ' || sqlerrm); end $$;
insert into _r(k, v) select 'A: portal test_entries', (parent_portal_data()->'test_entries')::text;
insert into _r(k, v) select 'A: portal next_test', (parent_portal_data()->'next_test')::text;
insert into _r(k, v) select 'A: belt_test_entries direct', count(*)::text from belt_test_entries;
insert into _r(k, v) select 'A: new invoice visible', count(*)::text from invoices where notes like 'Belt test:%' and invoice_date = current_date;
reset role;
insert into _r(k, v) select 'owner: invoice line', item_name || ' ' || amount || ' / total ' || i.total from invoice_lines l join invoices i on i.id = l.invoice_id where l.student_id = (select sid from _cand) and i.notes like 'Belt test:%' and i.invoice_date = current_date;
insert into _r(k, v) select 'owner: to-do', body from dashboard_notes where body like 'Belt test registration (online)%' order by created_at desc limit 1;
-- B: tries the same child (not theirs)
select set_config('request.jwt.claims', json_build_object('sub', (select uid from _p where rn = 2), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into _r(k, v) select 'B: sees A invoices', count(*)::text from invoices where customer_id = (select fam from _p where rn = 1);
insert into _r(k, v) select 'B: portal test_entries', (parent_portal_data()->'test_entries')::text;
reset role;
-- anon (no login)
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
insert into _r(k, v) select 'anon: calendars', count(*)::text from monthly_calendars;
reset role;
select k, v from _r order by n;
rollback;
