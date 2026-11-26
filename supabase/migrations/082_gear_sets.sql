-- 082: Gear sets (e.g. Full Sparring Gear = head gear + chest + arm + shin …)
--
-- fee_items.components: what a set is made of, [{ fee_item_id, quantity }].
--   A set isn't counted itself; selling one takes its parts out of stock.
-- invoice_lines.components: the parts actually handed over on that line,
--   with the size picked for each: [{ fee_item_id, item_name, size, quantity }]
--   (quantity per one set; the line's quantity multiplies it).
alter table fee_items add column if not exists components jsonb;
alter table invoice_lines add column if not exists components jsonb;

create or replace view inventory_levels with (security_invoker = true) as
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
sold_lines as (
  -- items sold on their own
  select l.fee_item_id, coalesce(l.size, '') as size, l.quantity as qty, i.invoice_date, i.created_at
  from invoice_lines l join invoices i on i.id = l.invoice_id
  where not i.voided and l.fee_item_id is not null and coalesce(jsonb_array_length(l.components), 0) = 0
  union all
  -- parts handed over as part of a set
  select (c->>'fee_item_id')::uuid, coalesce(c->>'size', ''), l.quantity * coalesce((c->>'quantity')::numeric, 1), i.invoice_date, i.created_at
  from invoice_lines l join invoices i on i.id = l.invoice_id
  cross join lateral jsonb_array_elements(case when jsonb_typeof(l.components) = 'array' then l.components else '[]'::jsonb end) c
  where not i.voided and c->>'fee_item_id' is not null
),
sales as (
  select sl.fee_item_id, sl.size,
         sum(sl.qty) as sold,
         sum(sl.qty) filter (where sl.invoice_date >= current_date - 30) as sold_30d,
         max(sl.invoice_date) as last_sold
  from sold_lines sl
  join fee_items fi on fi.id = sl.fee_item_id
  where fi.inventory_since is not null and sl.created_at >= fi.inventory_since
  group by 1, 2
),
keys as (
  select fee_item_id, size, ord from size_list
  union
  select k.fee_item_id, k.size, 1000 from (select fee_item_id, size from moves union select fee_item_id, size from sales) k
  where k.fee_item_id in (select id from tracked)
    and not exists (select 1 from size_list sl where sl.fee_item_id = k.fee_item_id and sl.size = k.size)
)
select f.id as fee_item_id, f.name, f.description, f.default_amount, f.low_stock_at, f.inventory_since, f.active,
       coalesce(m.stock_in, 0) as stock_in,
       coalesce(s.sold, 0) as sold,
       coalesce(s.sold_30d, 0) as sold_30d,
       case when f.inventory_since is null or (m.stock_in is null and s.sold is null) then null
            else coalesce(m.stock_in, 0) - coalesce(s.sold, 0) end as on_hand,
       s.last_sold,
       k.size,
       k.ord as size_order,
       f.sizes
from keys k
join tracked f on f.id = k.fee_item_id
left join moves m on m.fee_item_id = k.fee_item_id and m.size = k.size
left join sales s on s.fee_item_id = k.fee_item_id and s.size = k.size;
