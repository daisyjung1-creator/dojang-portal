-- 084: Colour belt stock. "Color Belt" is a tracked item whose sizes are the
-- belt colours; promoting a student on Belt Testing takes one belt of the new
-- colour out of stock (movement kind 'promotion'). Jacket sizes 120–190.
alter table inventory_movements drop constraint if exists inventory_movements_kind_check;
alter table inventory_movements add constraint inventory_movements_kind_check check (kind in ('received', 'count', 'returned', 'adjustment', 'promotion'));
insert into fee_items (name, description, default_amount, taxable, active, track_inventory, sizes, category, sort_order)
select 'Color Belt', 'Color Belt', 0, true, true, true,
  array['White','Yellow Stripe','Yellow','Green Stripe','Green','Blue Stripe','Blue','Red Stripe','Red','Black Stripe'], 'Uniform & Apparel', 40
where not exists (select 1 from fee_items where name = 'Color Belt');
update fee_items set sizes = array['120','130','140','150','160','170','180','190'] where name = 'Jacket';
