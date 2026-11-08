-- Trial class order: black belts (any age) → Advance; then 12 and up → Intermediate B;
-- color belts under 12 → Intermediate A; new students by age.
do $$
declare d text := pg_get_functiondef('public.book_trial(jsonb)'::regprocedure);
begin
  d := replace(d,
    E'when k_age >= 12 then ''Intermediate B''\n      when k_exp = ''Black belt'' then case when k->>''class'' in (''Advance Poomsae'', ''Advance Sparring'') then k->>''class'' else ''Advance Poomsae'' end',
    E'when k_exp = ''Black belt'' then case when k->>''class'' in (''Advance Poomsae'', ''Advance Sparring'') then k->>''class'' else ''Advance Poomsae'' end\n      when k_age >= 12 then ''Intermediate B''');
  if position(E'Advance Poomsae'' end\n      when k_age >= 12' in d) = 0 then raise exception 'pattern not found'; end if;
  execute d;
end $$;
