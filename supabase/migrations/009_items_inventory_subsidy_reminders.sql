-- 1. Item list copied from Express Invoice (Item / Description / Tax / Value).
--    Express "Default" and "GST" tax = GST applies; "None" = no GST.
-- 2. Inventory tracking for physical goods.
-- 3. Subsidy (sports grant) reminder email template + "reminded" date.

-- ── 1. Items ────────────────────────────────────────────────────────────
-- The four placeholder items from the original setup are hidden (kept for
-- any invoices that already use them).
update fee_items set active = false
where name in ('Uniform Fee', 'Belt Test Fee', 'Competition Fee', 'Other') and coalesce(default_amount, 0) = 0;

alter table fee_items add column if not exists track_inventory boolean not null default false;
alter table fee_items add column if not exists inventory_since timestamptz;   -- set by the first stock count
alter table fee_items add column if not exists low_stock_at int;              -- warn when on hand <= this

insert into fee_items (name, description, taxable, default_amount, track_inventory)
select v.name, v.description, v.taxable, v.price, v.track
from (values
  ('3 Month Plan - 2 D', '3 Months Plan 2 Days a week', true, 435.00, false),
  ('3 Month Plan - 2D', '3 Months Plan 2 Days a week', true, 390.00, false),
  ('3 Month Plan - 3D', '3 Months Plan 3 Days a week', true, 495.00, false),
  ('3 Month Plan - 4D', '3 Months Plan 4 Days a week', true, 585.00, false),
  ('Accomodation', 'Airbnb', false, 495.69, false),
  ('Adidas - Arm , Shin guard', 'Arm , Shin guard', true, 100.00, true),
  ('Adidas Foot Protector', 'Foot Guard', true, 55.00, true),
  ('Adidas Groin Guard', 'Groin Guard', true, 50.00, true),
  ('Adidas Head Gear', 'Head Grear', true, 68.00, true),
  ('Adudas Glove', 'Glove', true, 52.00, true),
  ('Arm Guard', 'Arm Guard', true, 40.00, true),
  ('Arm&Shin Guard', 'Arm , Shin guard', true, 80.00, true),
  ('ATA Sign up', 'ATA Membership Fee', false, 30.00, false),
  ('Backpack', 'Team Backpack', true, 120.00, true),
  ('Belt', 'Black Belt', true, 50.00, true),
  ('Bike Crew', '2026 Bick Crew Camp', true, 38.10, false),
  ('Black Belt Testing', '1st Degree Black Belt Test', true, 650.00, false),
  ('Black Belt Testing 2nd Degree', '2nd Degree Black Belt Test', true, 950.00, false),
  ('Chest Gear', 'Chest Gear', true, 80.00, true),
  ('Coach Fee', 'K.H.Min Tournament (10/3)', false, 50.00, false),
  ('Competition Team Plan', 'Competition Team Plan', true, 200.00, false),
  ('Day Camp', 'Teacher''s Strike Day Camp', true, 40.00, false),
  ('Debit/Cash 1D', '1 day/week Plan [Debit/Cash]', true, 135.00, false),
  ('Debit/Cash 2D', '2 days/week Plan [Debit/Cash]', true, 150.00, false),
  ('Debit/Cash 3D', '3 days/week Plan [Debit/Cash]', true, 170.00, false),
  ('Debit/Cash 4D', '4 days/week Plan [Debit/Cash]', true, 200.00, false),
  ('Debit/Cash 5D', '5 days/week Plan [Debit/Cash]', true, 200.00, false),
  ('Drop In', 'Drop In Class', true, 30.00, false),
  ('E sim', 'E-sim data', false, 42.40, false),
  ('Face Sheld', 'Face Sheld', true, 25.00, true),
  ('Field Trip', 'Learders Club', false, 10.00, false),
  ('Flight', 'Air Canada', false, 405.86, false),
  ('Foot Guard', 'Foot Guard', true, 34.00, true),
  ('Full Sparring Gear', 'Full Sparring Gear', true, 260.00, true),
  ('Fundraiser', 'Chocolate Fundraiser', false, 5.00, false),
  ('Game Day', 'Spring Break Game Day', false, 20.00, false),
  ('Glove', 'Glove', true, 34.00, true),
  ('Groin Guard - F', 'Groin Guard (Female)', true, 35.00, true),
  ('Groin Guard - Male', 'Groin Guard', true, 35.00, true),
  ('Hand Glove', 'Hand Glove', true, 34.00, true),
  ('Head Gear', 'Head Grear', true, 60.00, true),
  ('HP Team', 'High Performance Plan', true, 250.00, false),
  ('Jacket', 'Team Jacket', true, 99.00, true),
  ('Junior Black Belt', 'Poom Belt', true, 50.00, true),
  ('Kick Pad', 'Kick Pad', true, 40.00, true),
  ('KidSports', 'Kidsports Grant', false, 300.00, false),
  ('KPNP E-glove', 'E-glove', true, 160.00, true),
  ('KPNP E-socks', 'E-socks', true, 170.00, true),
  ('Kukkiwon', 're-issue certification', true, 42.97, false),
  ('Late Fee', 'Re- registration Fee', true, 5.00, false),
  ('Mooto Groin Guard', 'Groin Guard', true, 50.00, true),
  ('Mouth Guard', 'Mouth Guard - L', true, 5.00, true),
  ('Movie Night', 'Movie Night', false, 20.00, false),
  ('Name Engrave', 'Name Engrave (Custom Order)', true, 5.00, false),
  ('Payment', 'Payment', true, 0.00, false),
  ('Plan Change', 'Class Plan Change Difference', true, 25.00, false),
  ('Poom Belt', 'Junior Black Belt', true, 50.00, true),
  ('Poomsae Uniform', 'Poomsae Uniform', true, 150.00, true),
  ('Potluck Event', 'End of year Awards party', false, 30.00, false),
  ('Pre-Auth 1D', 'Pre-Authorized Payment 1 day/week', true, 135.00, false),
  ('Pre-Auth 2D', 'Pre-Authorized Payment 2 days/week', true, 150.00, false),
  ('Pre-Auth 3D', 'Pre-Authorized Payment 3 days/week', true, 170.00, false),
  ('Pre-Auth 4D', 'Pre-Authorized Payment 4 days/week', true, 200.00, false),
  ('Prep Pass Plan', 'Competition Team Prep Pass', true, 0.00, false),
  ('Private Lesson 5', 'Private Lesson 5 Classes', true, 200.00, false),
  ('Re registration', 'Re- registration Fee', true, 5.00, false),
  ('Re-print receipt', 'Repinting reciept', false, 5.00, false),
  ('Registration Fee', 'K.H.Min Tournament 10/3', false, 120.00, false),
  ('Seat Slection', 'Avianca Seat', true, 102.26, false),
  ('Shin Guard', 'Shin Guard', true, 40.00, true),
  ('Slipper', 'Slippers', true, 25.00, true),
  ('Sparring Uniform', 'Pro-Sparring Uniform', true, 240.00, true),
  ('Spring Camp', '3 Days', false, 135.00, false),
  ('Summer Camp', 'Summer Camp Day 4', true, 120.00, false),
  ('T Shirts', 'T Shirts', true, 30.00, true),
  ('Test Fee (Adv)', 'Advance Level (Blue- Red/s)', true, 80.00, false),
  ('Test Fee (Beg)', 'Beginner Level (White - Gre', true, 50.00, false),
  ('Test Fee (Int)', 'Intermediate Level (Green -', true, 60.00, false),
  ('Test Fee (Int/Adv)', 'Intermediate Level (Blue - R', true, 70.00, false),
  ('Test Fee (Mini)', 'Mini Test', true, 20.00, false),
  ('Tour', 'Peru Tour', true, 126.91, false),
  ('Uniform', 'Uniform (Youth)', true, 80.00, true),
  ('Wind Jacket', 'Wind Jacket', true, 75.00, true)
) as v(name, description, taxable, price, track)
where not exists (select 1 from fee_items f where f.name = v.name);

-- ── 2. Inventory ────────────────────────────────────────────────────────
-- Stock in (received, counts, returns) is recorded as movements. Stock out is
-- worked out from invoice lines, so editing, voiding or deleting an invoice
-- puts the stock back automatically. Only invoices created after the item's
-- first stock count reduce stock.
create table if not exists inventory_movements (
  id uuid primary key default gen_random_uuid(),
  fee_item_id uuid not null references fee_items(id) on delete cascade,
  movement_date date not null default current_date,
  kind text not null check (kind in ('received', 'count', 'returned', 'adjustment')),
  quantity numeric not null,          -- + adds to stock, - removes
  note text,
  created_at timestamptz not null default now()
);
create index if not exists inventory_movements_item_idx on inventory_movements (fee_item_id);
alter table inventory_movements enable row level security;
drop policy if exists "inventory_movements admin only" on inventory_movements;
create policy "inventory_movements admin only" on inventory_movements for all using (is_admin()) with check (is_admin());

create or replace view inventory_levels with (security_invoker = true) as
select f.id as fee_item_id, f.name, f.description, f.default_amount, f.low_stock_at, f.inventory_since, f.active,
       coalesce(m.stock_in, 0) as stock_in,
       coalesce(s.sold, 0) as sold,
       coalesce(s.sold_30d, 0) as sold_30d,
       case when f.inventory_since is null then null else coalesce(m.stock_in, 0) - coalesce(s.sold, 0) end as on_hand,
       s.last_sold
from fee_items f
left join (select fee_item_id, sum(quantity) as stock_in from inventory_movements group by fee_item_id) m on m.fee_item_id = f.id
left join (
  select l.fee_item_id,
         sum(l.quantity) as sold,
         sum(l.quantity) filter (where i.invoice_date >= current_date - 30) as sold_30d,
         max(i.invoice_date) as last_sold
  from invoice_lines l
  join invoices i on i.id = l.invoice_id
  join fee_items fi on fi.id = l.fee_item_id
  where not i.voided and fi.inventory_since is not null and i.created_at >= fi.inventory_since
  group by l.fee_item_id
) s on s.fee_item_id = f.id
where f.track_inventory;

-- ── 3. Subsidy reminders ────────────────────────────────────────────────
alter table students add column if not exists subsidy_reminded_at timestamptz;

alter table invoice_settings add column if not exists subsidy_reminder_subject text
  default 'Sports grant ending soon for {student}';
alter table invoice_settings add column if not exists subsidy_reminder_message text
  default 'Hello,' || chr(10) || chr(10)
  || 'We hope you are doing well. This is a reminder that {student}''s sports grant will end at the end of {end_month}.' || chr(10)
  || 'Please apply for the Kidsports grants for this year. If you no longer need a sports grant or are not planning to renew before the grant period ends this year, your account will automatically revert to the original price after the sports grant ends in {end_month}.' || chr(10)
  || 'Please let us know if you have finished the application. If you need any help or questions, please let me know.' || chr(10)
  || 'Kidsports: https://kidsportcanada.ca/alberta/edmonton/apply-for-a-grant/' || chr(10) || chr(10)
  || 'Best Regards,' || chr(10)
  || 'Master Daisy';
update invoice_settings set
  subsidy_reminder_subject = coalesce(subsidy_reminder_subject, 'Sports grant ending soon for {student}')
where id = 1;

alter table email_queue drop constraint if exists email_queue_type_check;
alter table email_queue add constraint email_queue_type_check
  check (type in ('welcome', 'tryout_confirmation', 'invoice', 'receipt', 'refund', 'subsidy_reminder'));
