-- How each family pays tuition.
--   preauth = pre-authorized credit card (most families): charged on the
--             billing date, no invoice / reminder emails in advance.
--   manual  = pays by debit / cash themselves: invoice 7 days before and a
--             reminder 3 days before, both sent only when approved on Billing.
alter table customers add column if not exists payment_type text not null default 'preauth'
  check (payment_type in ('preauth', 'manual'));

update customers set payment_type = 'manual'
where id in (
  select customer_id from students where customer_id is not null and name in (
    'Hafsa Mohamed', 'Marcelino Thomson', 'Deveshi Khandelwal', 'Radhika Khandelwal', 'Soe Reh',
    'Ishaan Suraj', 'Mohammad Zia Shabbir Khan', 'Dellen Winiarki', 'Farhan Ali', 'Khalid Ali',
    'Adonis Laboucan', 'Elizabeth Giusti', 'Lenard Al Marines', 'Izacc Junehl E Samalio', 'Zayd Ahmed'
  )
);

-- $150 a month is the 2-classes-a-week rate.
update students set classes_per_week = 2
where classes_per_week is null and tuition = 150 and coalesce(plan, '1 Month') = '1 Month';
