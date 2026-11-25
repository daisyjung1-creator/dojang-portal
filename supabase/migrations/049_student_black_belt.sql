-- 049: Black belt records per student (Kukkiwon + World Taekwondo Global
-- Licence). Kept in their own admin-only table: the students table is
-- readable by every staff login, and these include account passwords.
create table if not exists student_black_belt (
  student_id uuid primary key references students(id) on delete cascade,
  kukkiwon_no text,
  dan_certificate_no text,
  tcon_id text,
  tcon_password text,
  gl_no text,
  gl_id text,
  gl_password text,
  notes text,
  updated_at timestamptz not null default now()
);
alter table student_black_belt enable row level security;
drop policy if exists "student_black_belt admin" on student_black_belt;
create policy "student_black_belt admin" on student_black_belt for all using (is_admin()) with check (is_admin());
drop policy if exists "block coach" on student_black_belt;
create policy "block coach" on student_black_belt as restrictive for all using (not is_coach());
