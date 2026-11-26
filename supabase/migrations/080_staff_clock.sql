-- 080: Staff Clock — the staff clock-in / schedule app ("Team Hankook",
-- attendance-portal repo) moved into the dojang portal as one tab.
-- Admin sees the full admin dashboard; staff logins (front-desk iPad) see the
-- employee side, where each employee picks their name and enters their PIN.
-- Ids are kept from the old app, so payroll_employees.attendance_employee_id
-- still points at the right person.

create or replace function is_clock_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'staff'));
$$;

create table if not exists staff_clock_employees (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  email text,
  created_at timestamptz default now()
);

-- PINs live in their own admin-only table; staff logins check a PIN through
-- staff_clock_check_pin() and never read them.
create table if not exists staff_clock_pins (
  employee_id uuid primary key references staff_clock_employees(id) on delete cascade,
  pin text not null
);

create table if not exists staff_clock_entries (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references staff_clock_employees(id) on delete cascade,
  date date not null,
  clock_in timestamptz not null,
  clock_out timestamptz,
  edited_by_admin boolean not null default false
);
create index if not exists staff_clock_entries_emp_date on staff_clock_entries (employee_id, date);

create table if not exists staff_clock_shifts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references staff_clock_employees(id) on delete cascade,
  date date not null,
  start_time text not null,
  end_time text not null,
  is_lead boolean not null default false,
  unique (employee_id, date)
);

create table if not exists staff_clock_notes (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references staff_clock_employees(id) on delete cascade,
  date date not null,
  text text not null,
  created_at timestamptz default now(),
  author text not null default 'employee',
  parent_id uuid references staff_clock_notes(id) on delete cascade,
  read boolean not null default false
);

create table if not exists staff_clock_swaps (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid references staff_clock_employees(id) on delete cascade,
  target_id uuid references staff_clock_employees(id) on delete cascade,
  date date not null,
  note text,
  status text not null default 'pending', -- pending | approved | rejected
  created_at timestamptz default now(),
  resolved_at timestamptz
);

create table if not exists staff_clock_audit (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  employee_id uuid references staff_clock_employees(id) on delete set null,
  details text not null,
  created_at timestamptz default now()
);

create table if not exists staff_clock_time_off (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references staff_clock_employees(id) on delete cascade,
  date date not null,
  note text,
  created_by text not null default 'employee',
  created_at timestamptz default now(),
  unique (employee_id, date)
);

create table if not exists staff_clock_events (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  type text not null default 'event', -- holiday | event
  title text not null,
  note text,
  created_at timestamptz default now()
);

create table if not exists staff_clock_settings (
  id int primary key default 1 check (id = 1),
  notify_email text,
  location_lat double precision,
  location_lng double precision,
  location_radius_m integer default 100,
  device_lock_token text
);
insert into staff_clock_settings (id, notify_email) values (1, 'hankooktkd@gmail.com') on conflict (id) do nothing;

-- ── Row level security ────────────────────────────────────────────────
alter table staff_clock_employees enable row level security;
alter table staff_clock_pins enable row level security;
alter table staff_clock_entries enable row level security;
alter table staff_clock_shifts enable row level security;
alter table staff_clock_notes enable row level security;
alter table staff_clock_swaps enable row level security;
alter table staff_clock_audit enable row level security;
alter table staff_clock_time_off enable row level security;
alter table staff_clock_events enable row level security;
alter table staff_clock_settings enable row level security;

drop policy if exists "clock employees read" on staff_clock_employees;
create policy "clock employees read" on staff_clock_employees for select using (is_clock_user());
drop policy if exists "clock employees admin" on staff_clock_employees;
create policy "clock employees admin" on staff_clock_employees for all using (is_admin()) with check (is_admin());

drop policy if exists "clock pins admin" on staff_clock_pins;
create policy "clock pins admin" on staff_clock_pins for all using (is_admin()) with check (is_admin());

drop policy if exists "clock settings read" on staff_clock_settings;
create policy "clock settings read" on staff_clock_settings for select using (is_clock_user());
drop policy if exists "clock settings admin" on staff_clock_settings;
create policy "clock settings admin" on staff_clock_settings for all using (is_admin()) with check (is_admin());

-- Day-to-day records: anyone signed in as admin or staff (as in the old app).
do $$
declare t text;
begin
  foreach t in array array['staff_clock_entries', 'staff_clock_shifts', 'staff_clock_notes', 'staff_clock_swaps', 'staff_clock_audit', 'staff_clock_time_off', 'staff_clock_events'] loop
    execute format('drop policy if exists "clock users" on %I', t);
    execute format('create policy "clock users" on %I for all using (is_clock_user()) with check (is_clock_user())', t);
  end loop;
end $$;

-- ── PIN check (staff side) ───────────────────────────────────────────
create or replace function staff_clock_check_pin(p_employee uuid, p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_clock_user() then return false; end if;
  return exists (select 1 from staff_clock_pins where employee_id = p_employee and pin = p_pin);
end;
$$;
revoke execute on function staff_clock_check_pin(uuid, text) from public, anon;
grant execute on function staff_clock_check_pin(uuid, text) to authenticated;

-- ── Email notices (schedule changes, swaps, book-offs) ───────────────
-- Queued as a one-off plain email ('broadcast' with no broadcast_id, like
-- statements) and sent by send-emails. Only to the notification email or an
-- employee's own email, so the staff login can't email anyone else.
create or replace function staff_clock_notify(p_to text, p_subject text, p_message text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare to_addr text := lower(trim(coalesce(p_to, '')));
begin
  if not is_clock_user() or to_addr = '' then return false; end if;
  if not exists (select 1 from staff_clock_settings where lower(trim(notify_email)) = to_addr)
     and not exists (select 1 from staff_clock_employees where lower(trim(email)) = to_addr) then
    return false;
  end if;
  if (select count(*) from email_queue where type = 'broadcast' and payload->>'source' = 'staff_clock' and created_at > now() - interval '1 day') >= 100 then
    return false;
  end if;
  insert into email_queue (type, recipient_email, payload)
  values ('broadcast', to_addr, jsonb_build_object('source', 'staff_clock', 'subject', left(coalesce(p_subject, ''), 200), 'message', left(coalesce(p_message, ''), 4000)));
  return true;
end;
$$;
revoke execute on function staff_clock_notify(text, text, text) from public, anon;
grant execute on function staff_clock_notify(text, text, text) to authenticated;
