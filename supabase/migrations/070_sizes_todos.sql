-- 070: stock by size, and Home To-do (was Notes)
--
-- 1. Sizes. An item can have a list of sizes (protective gear S/M/L, chest
--    protectors 00/0/1/2/3/4, belts 2/3/4). Stock in (counts, received…) and
--    stock out (invoice lines) carry the size, and inventory_levels has one row
--    per item and size. Items without sizes keep a single row (size '').
alter table fee_items add column if not exists sizes text[];
alter table inventory_movements add column if not exists size text not null default '';
alter table invoice_lines add column if not exists size text;

drop view if exists inventory_levels;
create view inventory_levels with (security_invoker = true) as
with tracked as (
  select f.* from fee_items f where f.track_inventory
),
size_list as (
  select t.id as fee_item_id, s.size, s.ord
  from tracked t
  cross join lateral unnest(case when coalesce(cardinality(t.sizes), 0) = 0 then array['']::text[] else t.sizes end) with ordinality as s(size, ord)
),
moves as (
  select m.fee_item_id, coalesce(m.size, '') as size, sum(m.quantity) as stock_in
  from inventory_movements m group by 1, 2
),
sales as (
  select l.fee_item_id, coalesce(l.size, '') as size,
         sum(l.quantity) as sold,
         sum(l.quantity) filter (where i.invoice_date >= current_date - 30) as sold_30d,
         max(i.invoice_date) as last_sold
  from invoice_lines l
  join invoices i on i.id = l.invoice_id
  join fee_items fi on fi.id = l.fee_item_id
  where not i.voided and fi.inventory_since is not null and i.created_at >= fi.inventory_since
  group by 1, 2
),
keys as (
  select fee_item_id, size, ord from size_list
  union
  -- stock or sales recorded under a size the item no longer lists (or no size)
  select k.fee_item_id, k.size, 1000 from (select fee_item_id, size from moves union select fee_item_id, size from sales) k
  where k.fee_item_id in (select id from tracked)
    and not exists (select 1 from size_list sl where sl.fee_item_id = k.fee_item_id and sl.size = k.size)
)
select f.id as fee_item_id, f.name, f.description, f.default_amount, f.low_stock_at, f.inventory_since, f.active,
       coalesce(m.stock_in, 0) as stock_in,
       coalesce(s.sold, 0) as sold,
       coalesce(s.sold_30d, 0) as sold_30d,
       case when f.inventory_since is null then null else coalesce(m.stock_in, 0) - coalesce(s.sold, 0) end as on_hand,
       s.last_sold,
       k.size,
       k.ord as size_order,
       f.sizes
from keys k
join tracked f on f.id = k.fee_item_id
left join moves m on m.fee_item_id = k.fee_item_id and m.size = k.size
left join sales s on s.fee_item_id = k.fee_item_id and s.size = k.size;

-- Sizes for the gear that comes in sizes (changeable on the Inventory page).
update fee_items set sizes = array['00','0','1','2','3','4'] where name = 'Chest Gear' and sizes is null;
update fee_items set sizes = array['2','3','4'] where name in ('Belt', 'Poom Belt') and sizes is null;
update fee_items set sizes = array['S','M','L']
where sizes is null and track_inventory and name in (
  'Arm Guard', 'Shin Guard', 'Arm&Shin Guard', 'Foot Guard', 'Glove', 'Head Gear', 'Groin Guard - F', 'Groin Guard - Male',
  'Adidas - Arm , Shin guard', 'Adidas Foot Protector', 'Adidas Groin Guard', 'Adidas Head Gear', 'Adudas Glove', 'Mooto Groin Guard'
);

-- 2. To-do. dashboard_notes becomes the Home To-do list. Items the portal adds
--    by itself (e.g. "Order Chest Gear size 2") carry an auto_key so they are
--    added once and cleared when the reason goes away.
alter table dashboard_notes add column if not exists auto_key text;
alter table dashboard_notes add column if not exists link_tab text;
create unique index if not exists dashboard_notes_auto_key on dashboard_notes (auto_key) where auto_key is not null;
-- (follow-up) plain unique index so the portal can insert-if-missing with on_conflict=auto_key
drop index if exists dashboard_notes_auto_key;
create unique index if not exists dashboard_notes_auto_key_uq on dashboard_notes (auto_key);
-- (follow-up 070c) a size with nothing recorded yet (added after the first count)
-- shows as not counted (on_hand null) rather than out of stock: in the view,
--   on_hand = case when inventory_since is null or (stock_in is null and sold is null) then null else stock_in - sold end
