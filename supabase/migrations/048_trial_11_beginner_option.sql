-- An 11-year-old with no experience may pick Beginner or Intermediate B.
do $$
declare d text := pg_get_functiondef('public.book_trial(jsonb)'::regprocedure);
begin
  d := replace(d,
    E'when k_age >= 11 then ''Intermediate B'' else ''Beginner'' end;',
    E'when k_age >= 11 then case when k->>''class'' = ''Beginner'' then ''Beginner'' else ''Intermediate B'' end else ''Beginner'' end;');
  if position(E'k->>''class'' = ''Beginner''' in d) = 0 then raise exception 'pattern not found'; end if;
  execute d;
end $$;
