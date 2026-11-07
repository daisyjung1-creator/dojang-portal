-- Inquiry replies: the child's age picks the trial class; remember when and
-- how we last reached out (email / text).
alter table leads add column if not exists student_age int;
alter table leads add column if not exists contacted_at timestamptz;
alter table leads add column if not exists contacted_by text;
