-- Hours can be h:mm (e.g. 36:31.5 = 36.525 h); keep enough decimals for the pay to match.
alter table payslips alter column hours type numeric(9,4), alter column overtime_hours type numeric(9,4);
