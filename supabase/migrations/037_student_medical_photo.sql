alter table public.students add column if not exists medical text;
alter table public.students add column if not exists photo_consent boolean;
comment on column public.students.medical is 'Medical conditions, allergies or limitations coaches should know (shown as an alert in attendance).';
comment on column public.students.photo_consent is 'Promotional photo/video consent: true = yes, false = NO photos, null = not asked.';
