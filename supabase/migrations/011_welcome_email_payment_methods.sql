-- 1. Editable payment methods (the dojang's automatic payments are a
--    pre-authorized CREDIT CARD, not pre-authorized debit).
-- 2. Welcome email template + refund policy text, sent from the portal with a
--    preview (replaces the old two-line automatic welcome email).

alter table invoice_settings add column if not exists payment_methods text[] not null default array[
  'Pre-Authorized Credit Card', 'Interac e-Transfer', 'Debit', 'Cash', 'Visa', 'Mastercard', 'Cheque', 'Subsidy (KidSport etc.)', 'Other'
];

update invoice_payments set method = 'Pre-Authorized Credit Card' where method = 'Pre-Authorized Debit';
alter table invoice_payments alter column method set default 'Pre-Authorized Credit Card';

alter table invoice_settings add column if not exists refund_policy text
  default '[Please write your refund policy in Invoice Settings → Refund policy]';

alter table invoice_settings add column if not exists welcome_subject text
  default 'Welcome to {business}, {student}!';

alter table invoice_settings add column if not exists welcome_message text default
     'Hello {guardian},' || chr(10) || chr(10)
  || 'Welcome to the Hankook Taekwondo family! We''re excited to have {student} training with us.' || chr(10) || chr(10)
  || 'YOUR CLASS' || chr(10)
  || '{student} is registered in: {classes}' || chr(10)
  || 'Start date: {start_date}' || chr(10)
  || 'Please arrive 10 minutes early on the first day so we can help {student} get settled.' || chr(10) || chr(10)
  || 'TUITION' || chr(10)
  || 'Plan: {plan}' || chr(10)
  || 'Tuition: {tuition}' || chr(10)
  || '{subsidy_note}' || chr(10)
  || 'Tuition is charged to your credit card on file (pre-authorized payment) {billing_schedule}. Your next payment date is {next_billing}.' || chr(10)
  || 'An invoice and receipt will be emailed to you each time.' || chr(10) || chr(10)
  || 'REFUND POLICY' || chr(10)
  || '{refund_policy}' || chr(10) || chr(10)
  || 'MISSED A CLASS?' || chr(10)
  || 'If {student} misses a class, they can make it up in another class within 30 days. Just let us know which day works for you.' || chr(10) || chr(10)
  || 'WHAT TO BRING' || chr(10)
  || '- Uniform (dobok) and belt' || chr(10)
  || '- A water bottle' || chr(10)
  || '- No jewellery, and long hair tied back' || chr(10) || chr(10)
  || 'Location: {address}' || chr(10)
  || 'Phone: {phone} · Email: {email}' || chr(10) || chr(10)
  || 'If you have any questions at all, please don''t hesitate to reach out. We look forward to seeing you on the mat!' || chr(10) || chr(10)
  || 'Best Regards,' || chr(10)
  || 'Master Daisy';

alter table students add column if not exists welcome_sent_at timestamptz;
