// Stock helpers shared by Inventory, Home (To-do) and the sidebar badges.
import { supabase } from '../supabaseClient';

export const SIZE_PRESETS = [
  { label: 'Protective gear', sizes: ['S', 'M', 'L'] },
  { label: 'Chest protector (hogu)', sizes: ['00', '0', '1', '2', '3', '4'] },
  { label: 'Belt', sizes: ['2', '3', '4'] },
];

// One inventory_levels row = one item in one size ('' = no sizes).
export const stockStatus = (r) =>
  r.on_hand === null || r.on_hand === undefined ? 'uncounted' : Number(r.on_hand) <= 0 ? 'out' : r.low_stock_at != null && Number(r.on_hand) <= Number(r.low_stock_at) ? 'low' : 'ok';

export const sizeLabel = (size) => (size ? `size ${size}` : '');
export const itemWithSize = (name, size) => (size ? `${name} (size ${size})` : name);

// Counted items (or sizes) that are out or at/below the warning level.
export const lowRows = (levels) => (levels || []).filter((r) => r.active !== false && ['low', 'out'].includes(stockStatus(r)));

export const stockKey = (r) => `stock:${r.fee_item_id}:${r.size || ''}`;

// Keeps the Home To-do in step with stock: adds "Order …" once when an item
// (or a size) runs low, and removes it again when the stock is back up.
// If you tick it off while it's still low it stays ticked — it isn't re-added
// until the stock has recovered and runs low again.
// Home and Inventory can both run this at once, so runs are queued one after
// another (and the database refuses a second copy of the same auto_key anyway).
let running = Promise.resolve();
export function syncStockTodos(levels) {
  const next = running.then(() => doSync(levels)).catch(() => ({ changed: false }));
  running = next;
  return next;
}
async function doSync(levels) {
  let rows = levels;
  if (!rows) {
    const { data, error } = await supabase.from('inventory_levels').select('*');
    if (error) return { changed: false };
    rows = data || [];
  }
  const low = lowRows(rows);
  const want = new Map(low.map((r) => [stockKey(r), r]));
  const { data: existing } = await supabase.from('dashboard_notes').select('id, auto_key, done').like('auto_key', 'stock:%');
  const have = new Map((existing || []).map((n) => [n.auto_key, n]));
  const add = [...want.entries()]
    .filter(([k]) => !have.has(k))
    .map(([k, r]) => ({
      auto_key: k,
      link_tab: 'inventory',
      note_date: null,
      body: `Order ${itemWithSize(r.name, r.size)} — ${Number(r.on_hand) <= 0 ? 'out of stock' : `${Number(r.on_hand)} left`}`,
    }));
  const remove = (existing || []).filter((n) => !want.has(n.auto_key)).map((n) => n.id);
  if (add.length) await supabase.from('dashboard_notes').upsert(add, { onConflict: 'auto_key', ignoreDuplicates: true });
  if (remove.length) await supabase.from('dashboard_notes').delete().in('id', remove);
  return { changed: !!(add.length || remove.length) };
}
