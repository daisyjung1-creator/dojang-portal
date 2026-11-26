-- 078: "View as parent" — the admin can open any family's parent portal
-- (read-only preview) from the student page.
--
-- The parent portal's data now comes from portal_data_for(family), which
-- nobody can call directly. parent_portal_data() feeds it the parent's own
-- family (unchanged for parents); admin_parent_portal_data(family) feeds it
-- any family, but only for the admin login.

create or replace function public.portal_data_for(fam uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  today date := (now() at time zone 'America/Edmonton')::date;
  nt belt_tests;
begin
  if fam is null then raise exception 'No family.'; end if;
  select * into nt from belt_tests where test_date >= today order by test_date limit 1;
  return jsonb_build_object(
    'family', (select jsonb_build_object('id', c.id, 'name', c.name, 'email', c.email, 'phone', c.phone, 'address', c.address,
                 'payment_type', c.payment_type, 'card_last4', c.card_last4, 'card_expiry', c.card_expiry, 'card_type', c.card_type,
                 'card_saved', c.card_profile_code is not null, 'card_link_token', c.card_link_token,
                 'credit', coalesce((select credit from customer_credit cc where cc.customer_id = c.id), 0))
               from customers c where c.id = fam),
    'cards', coalesce((select jsonb_agg(jsonb_build_object('last4', k.last4, 'expiry', k.expiry, 'type', k.card_type, 'is_default', k.is_default) order by k.is_default desc, k.saved_at desc)
               from customer_cards k where k.customer_id = fam and k.removed_at is null), '[]'::jsonb),
    'students', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', s.id, 'name', s.name, 'belt', coalesce(s.belt, 'White'), 'dob', s.dob, 'class_name', s.class_name, 'class_days', s.class_days,
                 'classes_per_week', s.classes_per_week, 'plan', s.plan, 'tuition', s.tuition, 'status', coalesce(s.status, 'active'),
                 'enroll_date', s.enroll_date, 'billing_start_date', s.billing_start_date, 'billing_end_date', s.billing_end_date,
                 'last_test_date', s.last_test_date, 'hold_from', s.hold_from, 'hold_until', s.hold_until, 'billing_exempt', s.billing_exempt,
                 'subsidy', s.subsidy, 'subsidy_name', s.subsidy_name, 'subsidy_amount', s.subsidy_amount, 'subsidy_end_date', s.subsidy_end_date,
                 'family_discount', s.family_discount, 'classes_since_test', classes_since_test(s.id)) order by s.name)
               from students s where s.customer_id = fam and coalesce(s.status, 'active') <> 'withdrawn'), '[]'::jsonb),
    'schedule', coalesce((select jsonb_agg(jsonb_build_object('class_name', class_name, 'weekday', weekday, 'start_time', start_time, 'end_time', end_time) order by weekday, start_time)
               from class_schedule where active), '[]'::jsonb),
    'next_test', case when nt.id is null then null else jsonb_build_object('id', nt.id, 'date', nt.test_date, 'title', nt.title) end,
    'test_entries', coalesce((select jsonb_agg(jsonb_build_object('student_id', e.student_id, 'target_belt', e.target_belt, 'fee_item', e.fee_item))
               from belt_test_entries e join students s on s.id = e.student_id
               where e.test_id = nt.id and s.customer_id = fam), '[]'::jsonb),
    'test_fees', coalesce((select jsonb_object_agg(name, jsonb_build_object('amount', default_amount, 'taxable', taxable))
               from fee_items where name like 'Test Fee%'), '{}'::jsonb),
    'business', (select jsonb_build_object('business_name', business_name, 'address', address, 'phone', phone, 'email', email, 'website', website,
                 'gst_number', gst_number, 'logo_data', logo_data, 'invoice_footer', invoice_footer, 'payment_instructions', payment_instructions)
               from invoice_settings where id = 1)
  );
end;
$function$;

revoke execute on function public.portal_data_for(uuid) from public, anon, authenticated;

create or replace function public.parent_portal_data()
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  fam uuid := my_customer_id();
begin
  if fam is null then raise exception 'Not a parent login.'; end if;
  return portal_data_for(fam);
end;
$function$;

create or replace function public.admin_parent_portal_data(p_family uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  if not is_admin() then raise exception 'Admin only.'; end if;
  if not exists (select 1 from customers where id = p_family) then raise exception 'Family not found.'; end if;
  return portal_data_for(p_family);
end;
$function$;

revoke execute on function public.admin_parent_portal_data(uuid) from public, anon;
grant execute on function public.admin_parent_portal_data(uuid) to authenticated;
