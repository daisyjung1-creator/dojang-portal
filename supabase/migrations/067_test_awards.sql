-- Awards given at a belt test: a medal and/or one character patch.
-- A student gets each patch only once; past awards show on later tests.
alter table belt_test_entries
  add column if not exists medal boolean not null default false,
  add column if not exists patch text;
