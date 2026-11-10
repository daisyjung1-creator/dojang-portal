-- 050: Staff logins (front-desk iPad) can see and update trial bookings and
-- send the trial confirmation email. Deleting a trial stays admin-only.
drop policy if exists "tryouts staff" on tryouts;
create policy "tryouts staff" on tryouts for select using (auth.uid() is not null);
drop policy if exists "tryouts staff insert" on tryouts;
create policy "tryouts staff insert" on tryouts for insert with check (auth.uid() is not null);
drop policy if exists "tryouts staff update" on tryouts;
create policy "tryouts staff update" on tryouts for update using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "email_queue staff attendance emails" on email_queue;
create policy "email_queue staff attendance emails" on email_queue for insert
  with check (auth.uid() is not null and type in ('makeup', 'absence_check', 'tryout_confirmation'));
