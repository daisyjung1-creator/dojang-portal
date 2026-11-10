-- HP competition records. Admin (coach) only. Safe to run more than once. Run after 044_ytp.sql.
--
--   hp_competitions  one row per athlete per competition (placement, notes)
--   hp_matches       the matches at that competition

create table if not exists hp_competitions (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references hp_athletes(id) on delete cascade,
  name text not null,
  date date not null,
  division text,
  placement text check (placement in ('Gold', 'Silver', 'Bronze', '5th', 'Participated', 'Withdrew')),
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists hp_competitions_athlete_idx on hp_competitions (athlete_id, date);

create table if not exists hp_matches (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references hp_competitions(id) on delete cascade,
  sort int not null default 0,
  round text,
  opponent text,
  opponent_club text,
  result text check (result in ('W', 'L')),
  score text,          -- e.g. "2-1" in rounds, or round scores "8-5, 3-9, 12-4"
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists hp_matches_comp_idx on hp_matches (competition_id, sort);

do $$
declare t text;
begin
  foreach t in array array['hp_competitions', 'hp_matches']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || ' admin', t);
    execute format('create policy %I on %I for all using (is_admin()) with check (is_admin())', t || ' admin', t);
  end loop;
end $$;
