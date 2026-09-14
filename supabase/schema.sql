-- Run this once in the Supabase SQL editor for a new project.

create extension if not exists "pgcrypto";

-- ── Profiles (role: admin | staff) ─────────────────────────────────────────
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  role text not null check (role in ('admin', 'staff')) default 'staff',
  created_at timestamptz not null default now()
);

create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- ── Students ────────────────────────────────────────────────────────────
create table students (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  dob date,
  guardian_name text,
  guardian_phone text,
  guardian_email text,
  belt text default '흰띠',
  class_name text,
  tuition numeric,
  enroll_date date,
  notes text,
  created_at timestamptz not null default now()
);

-- ── Attendance ──────────────────────────────────────────────────────────
create table attendance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  date date not null,
  class_name text,
  status text not null check (status in ('present', 'absent')),
  created_at timestamptz not null default now(),
  unique (student_id, date, class_name)
);

-- ── Makeup classes (from absences) ─────────────────────────────────────
create table makeup_records (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  absence_date date not null,
  class_name text,
  next_billing_date date not null,
  paid_period_end date not null,
  tentative_expiration date not null,
  expiration_date date not null,
  conditional boolean not null default true,
  reservation_date date,
  status text not null default 'pending' check (status in ('pending', 'reserved', 'completed', 'expired')),
  created_at timestamptz not null default now()
);

-- ── Payments (per student billing cycle) ───────────────────────────────
create table payments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  cycle_start date not null,
  paid boolean not null default false,
  amount numeric,
  paid_date date,
  unique (student_id, cycle_start)
);

-- ── Leads / consultations ───────────────────────────────────────────────
create table leads (
  id uuid primary key default gen_random_uuid(),
  student_name text not null,
  guardian_name text,
  phone text,
  email text,
  source text,
  inquiry_date date,
  consult_date date,
  status text not null default '신규문의',
  notes text,
  created_at timestamptz not null default now()
);

-- ── Tryout bookings ─────────────────────────────────────────────────────
create table tryouts (
  id uuid primary key default gen_random_uuid(),
  student_name text not null,
  guardian_phone text,
  guardian_email text,
  class_name text,
  date date,
  time time,
  status text not null default '예정',
  notes text,
  created_at timestamptz not null default now()
);

-- ── Fee items + one-off charges ─────────────────────────────────────────
create table fee_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  default_amount numeric default 0
);

create table charges (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  fee_item_id uuid references fee_items(id) on delete set null,
  amount numeric not null default 0,
  date date,
  status text not null default '미납' check (status in ('미납', '완납'))
);

-- ── Welcome email queue ─────────────────────────────────────────────────
create table welcome_queue (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) on delete cascade,
  student_name text,
  guardian_email text,
  queued_date date,
  sent boolean not null default false
);

-- ── Row level security ──────────────────────────────────────────────────
alter table profiles enable row level security;
alter table students enable row level security;
alter table attendance enable row level security;
alter table makeup_records enable row level security;
alter table payments enable row level security;
alter table leads enable row level security;
alter table tryouts enable row level security;
alter table fee_items enable row level security;
alter table charges enable row level security;
alter table welcome_queue enable row level security;

-- profiles: everyone can read their own row
create policy "read own profile" on profiles for select using (id = auth.uid());

-- students: both roles can read (staff needs the roster for check-in);
-- only admin can create/edit/delete
create policy "students select" on students for select using (auth.uid() is not null);
create policy "students admin write" on students for insert with check (is_admin());
create policy "students admin update" on students for update using (is_admin());
create policy "students admin delete" on students for delete using (is_admin());

-- attendance + makeup_records: both roles can fully manage (this is the
-- front-desk workflow staff need day to day)
create policy "attendance all" on attendance for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "makeup all" on makeup_records for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- payments: both roles can read (so the makeup screen can show paid/unpaid),
-- only admin can confirm/change a payment (financial action)
create policy "payments select" on payments for select using (auth.uid() is not null);
create policy "payments admin write" on payments for insert with check (is_admin());
create policy "payments admin update" on payments for update using (is_admin());

-- everything else (leads, tryouts, fees, charges, welcome queue) is admin-only
create policy "leads admin only" on leads for all using (is_admin()) with check (is_admin());
create policy "tryouts admin only" on tryouts for all using (is_admin()) with check (is_admin());
create policy "fee_items admin only" on fee_items for all using (is_admin()) with check (is_admin());
create policy "charges admin only" on charges for all using (is_admin()) with check (is_admin());
create policy "welcome_queue admin only" on welcome_queue for all using (is_admin()) with check (is_admin());

-- seed default fee items
insert into fee_items (name, default_amount) values
  ('도복비', 0),
  ('승급심사비', 0),
  ('대회참가비', 0),
  ('기타', 0);

-- Auto-create a profile (default role: staff) whenever someone signs up.
-- After the owner's own account signs up, run once in the SQL editor:
--   update profiles set role = 'admin' where id = '<owner-user-id>';
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, role)
  values (new.id, new.raw_user_meta_data->>'name', 'staff');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

