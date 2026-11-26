-- 083: Items tidy-up. Each item gets a category; sort_order follows the
-- category so every item list (invoice, shop, settings) is grouped the same
-- way. Typos fixed. Renaming an item doesn't change past invoices (lines keep
-- their own copy of the name and description).
alter table fee_items add column if not exists category text;

update fee_items set category = case
  when name ~* '^(Debit/Cash|Pre-Auth|3 Month Plan)' or name in ('Competition Team Plan', 'HP Team', 'Prep Pass Plan', 'Drop In', 'Private Lesson 5', 'KidSports') then 'Tuition / Plans'
  when name ~* '^Test Fee' or name ~* '^Black Belt Testing' or name = 'Kukkiwon' then 'Testing'
  when name in ('Uniform', 'Poomsae Uniform', 'Sparring Uniform', 'Belt', 'Poom Belt', 'Jacket', 'Wind Jacket', 'T Shirts', 'Backpack', 'Slipper') then 'Uniform & Apparel'
  when track_inventory or components is not null then 'Gear'
  when name in ('Movie Night', 'Game Day', 'Day Camp', 'Spring Camp', 'Summer Camp', 'Potluck Event', 'Field Trip', 'Fundraiser', 'Bike Crew') then 'Events & Camps'
  when name in ('Coach Fee', 'Registration Fee', 'Flight', 'Accomodation', 'Seat Slection', 'Tour', 'ATA Sign up') then 'Competition & Travel'
  else 'Other fees'
end
where category is null;

update fee_items set sort_order = case category
  when 'Tuition / Plans' then 10 when 'Testing' then 20 when 'Gear' then 30 when 'Uniform & Apparel' then 40
  when 'Events & Camps' then 50 when 'Competition & Travel' then 60 else 70 end;

-- Typos / clearer names
update fee_items set name = 'Adidas Glove' where name = 'Adudas Glove';
update fee_items set name = 'Face Shield', description = 'Face Shield' where name = 'Face Sheld';
update fee_items set name = 'Seat Selection' where name = 'Seat Slection';
update fee_items set name = 'Accommodation' where name = 'Accomodation';
update fee_items set name = 'Adidas Arm & Shin Guard', description = 'Adidas Arm & Shin Guard' where name = 'Adidas - Arm , Shin guard';
update fee_items set description = 'Arm & Shin Guard' where name = 'Arm&Shin Guard';
update fee_items set name = 'Arm & Shin Guard' where name = 'Arm&Shin Guard';
update fee_items set description = 'Head Gear' where description = 'Head Grear' and name = 'Head Gear';
update fee_items set description = 'Adidas Head Gear' where name = 'Adidas Head Gear';
update fee_items set description = 'Bike Crew Camp' where name = 'Bike Crew' and description ilike '%Bick%';
update fee_items set description = 'Leaders Club Field Trip' where name = 'Field Trip' and description = 'Learders Club';
update fee_items set description = 'Re-print receipt' where name = 'Re-print receipt';
update fee_items set name = 'Re-registration Fee', description = 'Re-registration Fee' where name = 'Late Fee';
update fee_items set name = 'Groin Guard - Male', description = 'Groin Guard (Male)' where name = 'Groin Guard - Male';
update fee_items set name = 'Groin Guard - Female' where name = 'Groin Guard - F';
update fee_items set description = 'Mouth Guard' where name = 'Mouth Guard';
