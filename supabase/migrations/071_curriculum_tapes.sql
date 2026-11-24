-- 071: curriculum tapes for colour belts
-- Each colour belt has 7 tapes (white, orange, red, purple, brown, blue,
-- green). Instructors tick them per student; a tape belongs to the belt the
-- student held when it was earned, so a new belt starts again at 0/7.

-- Portal staff = the admin and the shared staff login (not tournament coaches,
-- and not parents once the parent portal exists).
create or replace function is_portal_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'staff'));
$$;

create table if not exists student_tapes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  belt text not null,
  tape text not null check (tape in ('white', 'orange', 'red', 'purple', 'brown', 'blue', 'green')),
  earned_on date not null default current_date,
  created_at timestamptz not null default now(),
  unique (student_id, belt, tape)
);
create index if not exists student_tapes_student_idx on student_tapes (student_id);
alter table student_tapes enable row level security;
create policy "student_tapes staff" on student_tapes for all using (is_portal_staff()) with check (is_portal_staff());
