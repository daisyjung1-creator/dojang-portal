-- 054: subsidy application tracking — when the family applied and whether
-- the grant is still waiting for approval. Only approved (or untracked)
-- subsidies come off tuition invoices.
alter table students add column if not exists subsidy_applied_on date;
alter table students add column if not exists subsidy_status text;
alter table students drop constraint if exists students_subsidy_status_check;
alter table students add constraint students_subsidy_status_check check (subsidy_status is null or subsidy_status in ('pending', 'approved', 'denied'));
