-- HP weight tracking. Admin (coach) only. Safe to run more than once. Run after 044_ytp.sql.
--
--   hp_athletes.weight_limit  the category limit in kg (e.g. 52 for -52kg), filled from the category text
--   hp_weights                one weigh-in per row

alter table hp_athletes add column if not exists weight_limit numeric check (weight_limit > 0);

update hp_athletes
set weight_limit = (regexp_match(category, '-\s*(\d+(?:\.\d+)?)\s*kg', 'i'))[1]::numeric
where weight_limit is null and category ~* '-\s*\d+(\.\d+)?\s*kg';

create table if not exists hp_weights (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references hp_athletes(id) on delete cascade,
  date date not null,
  weight_kg numeric not null check (weight_kg between 15 and 200),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists hp_weights_athlete_date_idx on hp_weights (athlete_id, date);

alter table hp_weights enable row level security;
drop policy if exists "hp_weights admin" on hp_weights;
create policy "hp_weights admin" on hp_weights for all using (is_admin()) with check (is_admin());
