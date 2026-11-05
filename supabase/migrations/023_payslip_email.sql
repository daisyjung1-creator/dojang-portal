-- Email payslips (PDF attached) to staff.
alter table payslips add column if not exists emailed_at timestamptz;
alter table email_queue drop constraint if exists email_queue_type_check;
alter table email_queue add constraint email_queue_type_check check (type = any (array[
  'welcome', 'tryout_confirmation', 'invoice', 'receipt', 'refund', 'subsidy_reminder',
  'broadcast', 'makeup', 'absence_check', 'payslip'
]));
