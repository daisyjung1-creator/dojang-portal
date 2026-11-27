-- 085: Color Belt sold at $20, stock kept by colour and size 1–4 ("Green 2").
-- students.belt_size remembers each student's belt size for promotions.
-- Wind Jacket sizes 130–190.
update fee_items set default_amount = 20, sizes = (
  select array_agg(c || ' ' || n order by ci, n) from unnest(array['White','Yellow Stripe','Yellow','Green Stripe','Green','Blue Stripe','Blue','Red Stripe','Red','Black Stripe']) with ordinality as t(c, ci), generate_series(1, 4) n
) where name = 'Color Belt';
update fee_items set sizes = array['130','140','150','160','170','180','190'] where name = 'Wind Jacket';
alter table students add column if not exists belt_size text;
