-- 051: Staff "Today" page shows the belt-test countdown and curriculum pacing,
-- so staff logins can read (not change) belt test dates and the curriculum.
drop policy if exists "belt_tests staff read" on belt_tests;
create policy "belt_tests staff read" on belt_tests for select using (auth.uid() is not null);
drop policy if exists "belt_curriculum staff read" on belt_curriculum;
create policy "belt_curriculum staff read" on belt_curriculum for select using (auth.uid() is not null);
