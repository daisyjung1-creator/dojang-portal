-- When the overdue-payment notice (class suspension per agreement 7.3) was emailed.
alter table invoices add column if not exists overdue_notice_at timestamptz;
