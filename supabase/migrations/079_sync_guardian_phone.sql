-- Guardian phone now syncs both ways like email, address and guardian name:
-- edit it on a student → the family (customer) and the brothers/sisters follow;
-- edit it on the family → its students follow.

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
  if new.guardian_phone is distinct from old.guardian_phone then
    update customers set phone = new.guardian_phone where id = new.customer_id and phone is distinct from new.guardian_phone;
  end if;
  return new;
end $$;

drop trigger if exists students_sync_to_customer on students;
create trigger students_sync_to_customer after update of guardian_email, address, guardian_name, guardian_phone on students
  for each row execute function students_sync_to_customer();

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
  if new.phone is distinct from old.phone then
    update students set guardian_phone = new.phone where customer_id = new.id and guardian_phone is distinct from new.phone;
  end if;
  return new;
end $$;

drop trigger if exists customers_sync_to_students on customers;
create trigger customers_sync_to_students after update of email, address, contact_name, phone on customers
  for each row execute function customers_sync_to_students();
