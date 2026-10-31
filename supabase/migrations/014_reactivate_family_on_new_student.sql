-- A student who joins (or is linked to) a family marked inactive brings it back.
create or replace function students_reactivate_customer() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.customer_id is not null and coalesce(new.status, 'active') <> 'withdrawn' then
    update customers set active = true where id = new.customer_id and active = false;
  end if;
  return new;
end $$;
revoke all on function students_reactivate_customer() from public, anon, authenticated;
drop trigger if exists students_reactivate_customer on students;
create trigger students_reactivate_customer after insert or update of customer_id, status on students
  for each row execute function students_reactivate_customer();

update customers c set active = true
where active = false and exists (select 1 from students s where s.customer_id = c.id and coalesce(s.status, 'active') <> 'withdrawn');
