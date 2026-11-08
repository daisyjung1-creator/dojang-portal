-- Online registration: parents fill in the public /join form (no login).
-- The form can only ADD a new registration; it can't read anything back.
-- An admin reviews it and turns it into students from the Register tab.
create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new', 'approved', 'dismissed')),
  family jsonb not null default '{}'::jsonb,   -- guardian, contacts, address, heard about us
  kids jsonb not null default '[]'::jsonb,     -- [{first, last, dob, medical, medical_detail, instructions, class_name, class_days}]
  frequency text,                              -- '2' | '3' | '4' | 'other'
  other_program text,
  plan text,                                   -- 'Monthly PAD' | 'Three-Month PAD' | 'Three-Month Advance Payment'
  start_date date,
  photo_consent boolean,
  signature_name text,
  signed_on date,
  adult_student boolean not null default false,
  agreement_version text,
  student_ids uuid[],
  handled_at timestamptz,
  constraint registrations_size check (octet_length(family::text) < 8000 and octet_length(kids::text) < 30000 and jsonb_array_length(kids) between 1 and 8)
);

alter table public.registrations enable row level security;

drop policy if exists "registrations admin" on public.registrations;
create policy "registrations admin" on public.registrations
  for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "registrations public insert" on public.registrations;
create policy "registrations public insert" on public.registrations
  for insert to anon, authenticated
  with check (status = 'new' and student_ids is null and handled_at is null and signature_name is not null and length(signature_name) between 2 and 120);

grant insert on public.registrations to anon;

-- The public form needs the class times (only those, nothing else).
create or replace function public.public_class_schedule()
returns table (class_name text, weekday int, start_time time, end_time time)
language sql stable security definer set search_path = public as $$
  select class_name, weekday, start_time, end_time from class_schedule where active order by weekday, start_time;
$$;
revoke all on function public.public_class_schedule() from public;
grant execute on function public.public_class_schedule() to anon, authenticated;

-- 034_public_logo: the school logo on the public form.
create or replace function public.public_dojang_logo()
returns text language sql stable security definer set search_path = public as $$
  select logo_data from invoice_settings where logo_data is not null limit 1;
$$;
revoke all on function public.public_dojang_logo() from public;
grant execute on function public.public_dojang_logo() to anon, authenticated;

-- 035_registration_signature_image: the signature drawn with a finger / mouse.
alter table public.registrations add column if not exists signature_image text;
alter table public.registrations drop constraint if exists registrations_signature_size;
alter table public.registrations add constraint registrations_signature_size check (signature_image is null or (signature_image like 'data:image/png;base64,%' and length(signature_image) < 300000));
