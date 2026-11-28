-- Events: the admin can close sign-up early (e.g. the room is full).
-- Parents then can't sign up (checked here, not only on the page).
alter table public.events add column if not exists signups_closed boolean not null default false;

do $do$
declare d text := pg_get_functiondef('public.event_register'::regproc);
begin
  d := replace(d,
    $x$if e.signup_deadline is not null and e.signup_deadline < today then raise exception 'Sign-up for this event has closed.'; end if;$x$,
    $x$if e.signup_deadline is not null and e.signup_deadline < today then raise exception 'Sign-up for this event has closed.'; end if;
    if coalesce(e.signups_closed, false) then raise exception 'Sign-up for this event has closed.'; end if;$x$);
  if position('signups_closed' in d) = 0 then raise exception 'event_register: deadline check not found'; end if;
  execute d;
end
$do$;

-- Same check in the older event_signup function.
do $do$
declare d text := pg_get_functiondef('public.event_signup'::regproc);
begin
  d := replace(d,
    $x$if e.signup_deadline is not null and e.signup_deadline < today then raise exception 'Sign-up for this event has closed.'; end if;$x$,
    $x$if e.signup_deadline is not null and e.signup_deadline < today then raise exception 'Sign-up for this event has closed.'; end if;
    if coalesce(e.signups_closed, false) then raise exception 'Sign-up for this event has closed.'; end if;$x$);
  if position('signups_closed' in d) = 0 then raise exception 'event_signup: deadline check not found'; end if;
  execute d;
end
$do$;
