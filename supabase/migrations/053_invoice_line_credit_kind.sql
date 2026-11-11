-- 053: manual invoices can carry a "credit" line (goodwill / adjustment).
do $$
declare c text;
begin
  select conname into c from pg_constraint where conrelid = 'invoice_lines'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%line_kind%';
  if c is not null then execute format('alter table invoice_lines drop constraint %I', c); end if;
end $$;
alter table invoice_lines add constraint invoice_lines_line_kind_check
  check (line_kind is null or line_kind in ('tuition', 'discount', 'subsidy', 'reregistration', 'credit'));
