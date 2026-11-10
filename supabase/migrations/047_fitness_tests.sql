-- Fitness testing for Comp Team students (and HP athletes). Admin (coach) only.
-- Safe to run more than once. Items come from "Team Hankook Athlete Testing" (Guide sheet).
--
--   fit_test_items    the test list (editable later)
--   fit_test_results  one value per student, test date, item and side ('' = no side, 'L', 'R')
--   fit_test_notes    a note per student per test date
--
-- better: 'higher' / 'lower' decides whether a change counts as an improvement; null = no direction (growth).

create table if not exists fit_test_items (
  key text primary key,
  category text not null,
  name text not null,
  unit text,
  sides boolean not null default false,
  better text check (better in ('higher', 'lower')),
  sort int not null default 0,
  notes text,
  active boolean not null default true
);

insert into fit_test_items (key, category, name, unit, sides, better, sort, notes) values
  ('height',           'Growth / PHV',    'Height',                       'cm',      false, null,     10, null),
  ('weight',           'Growth / PHV',    'Weight',                       'kg',      false, null,     20, null),
  ('sitting_height',   'Growth / PHV',    'Sitting Height',               'cm',      false, null,     30, null),
  ('phv_offset',       'Growth / PHV',    'PHV / Maturity Offset',        'years',   false, null,     40, 'Negative = before APHV; positive = after APHV.'),
  ('growth_remaining', 'Growth / PHV',    'Predicted Growth Remaining',   'cm',      false, null,     50, null),
  ('adult_height',     'Growth / PHV',    'Predicted Adult Height',       'cm',      false, null,     60, null),
  ('shuttle_20m',      'Endurance',       '20m Shuttle Run',              'laps',    false, 'higher', 100, 'Use the same shuttle-run protocol each test.'),
  ('sit_reach',        'Flexibility',     'Sit & Reach',                  'cm',      false, 'higher', 200, 'Keep the same box/setup each test.'),
  ('passive_slr',      'Flexibility',     'Passive Straight Leg Raise',   '°',       true,  'higher', 210, 'Test left and right separately.'),
  ('front_split',      'Flexibility',     'Front Split',                  'cm from floor', true, 'lower', 220, 'Lower number = closer to full split. Full split = 0.'),
  ('ankle',            'Mobility',        'Knee-to-Wall / Ankle',         'cm',      true,  'higher', 300, 'Heel stays on floor; test both sides.'),
  ('aslr',             'Mobility',        'ASLR',                         '°',       true,  'higher', 310, 'Active Straight Leg Raise.'),
  ('hip_ir',           'Mobility',        'Hip IR',                       '°',       true,  'higher', 320, 'Internal rotation.'),
  ('hip_er',           'Mobility',        'Hip ER',                       '°',       true,  'higher', 330, 'External rotation.'),
  ('kick_10s',         'Taekwondo Speed', '10-sec Kick',                  'kicks',   true,  'higher', 400, 'Count valid kicks in 10 seconds.'),
  ('steps',            'Footwork',        'Back & Front Steps',           null,      true,  null,     500, 'Choose one protocol and use it consistently.'),
  ('hop4',             'Power',           'Hop 4',                        'sec',     true,  'lower',  600, 'Use the same method each test.'),
  ('vertical_jump',    'Power',           'Vertical Jump',                'cm',      false, 'higher', 610, 'Use the same jump protocol each test.'),
  ('ybal_ant',         'Balance',         'Y-Balance Anterior',           'cm',      true,  'higher', 700, null),
  ('ybal_pm',          'Balance',         'Y-Balance Posteromedial',      'cm',      true,  'higher', 710, null),
  ('ybal_pl',          'Balance',         'Y-Balance Posterolateral',     'cm',      true,  'higher', 720, null)
on conflict (key) do nothing;

create table if not exists fit_test_results (
  student_id uuid not null references students(id) on delete cascade,
  test_date date not null,
  item_key text not null references fit_test_items(key) on update cascade on delete cascade,
  side text not null default '' check (side in ('', 'L', 'R')),
  value numeric not null,
  updated_at timestamptz not null default now(),
  primary key (student_id, test_date, item_key, side)
);
create index if not exists fit_test_results_date_idx on fit_test_results (test_date);

create table if not exists fit_test_notes (
  student_id uuid not null references students(id) on delete cascade,
  test_date date not null,
  note text not null,
  primary key (student_id, test_date)
);

do $$
declare t text;
begin
  foreach t in array array['fit_test_items', 'fit_test_results', 'fit_test_notes']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || ' admin', t);
    execute format('create policy %I on %I for all using (is_admin()) with check (is_admin())', t || ' admin', t);
  end loop;
end $$;
