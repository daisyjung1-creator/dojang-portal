-- An inquiry needs only one name: the child's or the parent's.
alter table leads alter column student_name drop not null;
alter table leads drop constraint if exists leads_name_present;
alter table leads add constraint leads_name_present check (coalesce(nullif(trim(student_name), ''), nullif(trim(guardian_name), '')) is not null) not valid;
