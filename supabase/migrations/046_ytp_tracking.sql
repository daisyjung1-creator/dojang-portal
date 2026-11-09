-- YTP weekly tracking. Admin (coach) only. Safe to run more than once. Run after 044_ytp.sql.
--
--   ytp_class_map   which physical abilities one attendance of a class counts toward.
--                   '*' = every physical ability planned that week (season-specific classes).
--   ytp_sessions    individual training from athletes' journals (entered weekly)
--   ytp_checks      the coach's weekly check on a technical / tactical skill

create table if not exists ytp_class_map (
  class_name text primary key,
  abilities text[] not null default '{}',
  updated_at timestamptz not null default now()
);

insert into ytp_class_map (class_name, abilities) values
  ('HP', array['Aerobic Stamina', 'Speed']),
  ('Advance Sparring', array['Aerobic Stamina', 'Speed']),
  ('Advance Poomsae', array['*']),
  ('Comp Team', array['*'])
on conflict (class_name) do nothing;

create table if not exists ytp_sessions (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references hp_athletes(id) on delete cascade,
  date date not null,
  kind text not null default 'Individual',
  minutes int check (minutes between 0 and 600),
  rpe int check (rpe between 6 and 20),          -- Borg scale (NCCP DAA section 4.7)
  abilities text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists ytp_sessions_athlete_date_idx on ytp_sessions (athlete_id, date);

create table if not exists ytp_checks (
  row_id uuid not null references ytp_rows(id) on delete cascade,
  week_no int not null check (week_no between 1 and 53),
  status text not null check (status in ('ready', 'on_track', 'needs_time')),
  note text,
  updated_at timestamptz not null default now(),
  primary key (row_id, week_no)
);

do $$
declare t text;
begin
  foreach t in array array['ytp_class_map', 'ytp_sessions', 'ytp_checks']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || ' admin', t);
    execute format('create policy %I on %I for all using (is_admin()) with check (is_admin())', t || ' admin', t);
  end loop;
end $$;
