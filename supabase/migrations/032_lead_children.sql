-- Siblings in one inquiry: children = [{ name, age }]. student_name keeps the
-- names joined ("Mia & Leo") for lists and search; student_age the first age.
alter table leads add column if not exists children jsonb;
update leads set children = jsonb_build_array(jsonb_build_object('name', coalesce(student_name, ''), 'age', student_age))
where children is null and (student_name is not null or student_age is not null);
