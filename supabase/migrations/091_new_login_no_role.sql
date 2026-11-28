-- Security: a brand-new login used to get the 'staff' role automatically.
-- If public sign-up were ever on, anyone could create a login and read staff
-- data. Now only a parent invite (app_metadata set by the server) makes a
-- profile here; staff logins get their profile from the manage-staff function,
-- and any other login has no role and can see nothing.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.raw_app_meta_data->>'portal_role' = 'parent' and (new.raw_app_meta_data->>'customer_id') is not null then
    insert into public.profiles (id, name, role, customer_id)
    values (new.id, new.raw_user_meta_data->>'name', 'parent', (new.raw_app_meta_data->>'customer_id')::uuid);
  end if;
  return new;
end;
$$;

-- Small helpers flagged by the linter: fix their search_path.
alter function public.form_value_filled(jsonb) set search_path = public;
alter function public.form_choice_ok(jsonb, jsonb) set search_path = public;
