-- YTP (Yearly Training Plan) for HP athletes. Admin (coach) only.
-- Safe to run more than once.
--
--   hp_athletes   one row per HP athlete (optionally linked to students for attendance)
--   ytp_seasons   e.g. '2026-27', starts Monday 2026-09-07, 52 weeks
--   ytp_plans     one plan per athlete per season
--   ytp_weeks     week-level numbers: phase, volume/intensity %, performance-factor %, planned training hours
--   ytp_events    competitions, camps, testing weeks, breaks (per plan)
--   ytp_rows      the plan's rows: physical abilities, technical / tactical skills, mental skills
--   ytp_cells     the code in one row for one week
--
-- Codes (terms from NCCP Developing Athletic Abilities, Appendix B and section 5.3):
--   physical rows:  D = Developed (development), M = Maintained (maintenance)
--   technical / tactical rows:  I = Introduced, D = Developed, C = Consolidated, R = Refined
--   mental rows:  X = trained that week

create table if not exists hp_athletes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) on delete set null,
  sheet_name text unique,
  display_name text not null,
  category text,
  level text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists ytp_seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  start_date date not null,
  weeks int not null default 52 check (weeks between 1 and 53),
  created_at timestamptz not null default now()
);

create table if not exists ytp_plans (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references hp_athletes(id) on delete cascade,
  season_id uuid not null references ytp_seasons(id) on delete cascade,
  notes text,
  updated_at timestamptz not null default now(),
  unique (athlete_id, season_id)
);

create table if not exists ytp_weeks (
  plan_id uuid not null references ytp_plans(id) on delete cascade,
  week_no int not null check (week_no between 1 and 53),
  week_start date not null,
  phase text check (phase in ('General Prep', 'Specific Prep', 'Pre-Competition', 'Competition',
                              'Taper', 'Peak', 'Transition', 'Break')),
  volume_pct numeric check (volume_pct between 0 and 100),
  intensity_pct numeric check (intensity_pct between 0 and 100),
  physical_pct numeric check (physical_pct between 0 and 100),
  technique_pct numeric check (technique_pct between 0 and 100),
  tactical_pct numeric check (tactical_pct between 0 and 100),
  mental_pct numeric check (mental_pct between 0 and 100),
  hours_planned numeric check (hours_planned >= 0),  -- "sess/week" row in the Excel = hours
  note text,
  primary key (plan_id, week_no)
);

create table if not exists ytp_events (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references ytp_plans(id) on delete cascade,
  week_no int not null check (week_no between 1 and 53),
  name text not null,
  kind text not null default 'competition' check (kind in ('competition', 'camp', 'testing', 'break', 'other')),
  priority text check (priority in ('L', 'M', 'H')),
  tentative boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists ytp_rows (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references ytp_plans(id) on delete cascade,
  area text not null check (area in ('physical', 'technical', 'tactical', 'mental')),
  name text not null,
  sort int not null default 0,
  unique (plan_id, area, name)
);

create table if not exists ytp_cells (
  row_id uuid not null references ytp_rows(id) on delete cascade,
  week_no int not null check (week_no between 1 and 53),
  code text not null check (code in ('I', 'D', 'C', 'R', 'M', 'X')),
  primary key (row_id, week_no)
);

-- If an earlier copy of this file already created sessions_planned, rename it.
do $$ begin
  if exists (select 1 from information_schema.columns where table_name = 'ytp_weeks' and column_name = 'sessions_planned') then
    alter table ytp_weeks rename column sessions_planned to hours_planned;
  end if;
end $$;

create index if not exists ytp_events_plan_idx on ytp_events (plan_id, week_no);
create index if not exists ytp_rows_plan_idx on ytp_rows (plan_id, sort);

-- Coach (admin) only — staff and the public can't see YTPs.
do $$
declare t text;
begin
  foreach t in array array['hp_athletes', 'ytp_seasons', 'ytp_plans', 'ytp_weeks', 'ytp_events', 'ytp_rows', 'ytp_cells']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || ' admin', t);
    execute format('create policy %I on %I for all using (is_admin()) with check (is_admin())', t || ' admin', t);
  end loop;
end $$;
