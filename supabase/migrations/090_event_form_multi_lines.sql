-- Event forms: a choice/dropdown answer may be a list when the form lets
-- families add several lines (e.g. Main Dish + Desserts, each with a dish name).
-- Every item in the list must still be one of the options.
create or replace function public.form_choice_ok(v jsonb, opts jsonb)
returns boolean
language sql
immutable
as $$
  select case jsonb_typeof(v)
    when 'array' then jsonb_array_length(v) <= 10
                      and not exists (select 1 from jsonb_array_elements(v) x where not opts ? (x #>> '{}'))
    else opts ? (v #>> '{}') end
$$;

-- Use it in event_register_form (both the per-child and the family branch).
do $do$
declare d text := pg_get_functiondef('public.event_register_form'::regproc);
begin
  d := replace(d, $x$and not opts ? (v #>> '{}') then$x$, $x$and not form_choice_ok(v, opts) then$x$);
  execute d;
end
$do$;
