import React, { useEffect, useMemo, useState } from 'react';
import { Search, Plus, ClipboardCheck, Check, Ruler } from 'lucide-react';
import { matchScore } from '../../components/SearchSelect';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import Field from '../../components/Field';
import Modal from '../../components/Modal';
import { money, localISO, formatDate } from '../../lib/invoiceUtils';
import { fetchAll } from './api';
import { refreshBadges } from '../../lib/badges';
import { stockStatus as status, SIZE_PRESETS, syncStockTodos, itemWithSize } from '../../lib/stock';

// Stock on hand for physical items (gear, uniforms, belts…).
// Stock in = received / counted / returned (inventory_movements).
// Stock out = quantities on invoices (worked out automatically, so voiding or
// editing an invoice puts the stock back). Counting starts at the first count.
// Items can have sizes (S/M/L, 00–4, belt 2/3/4): stock is kept per size.
const KINDS = {
  received: 'Received (new stock)',
  returned: 'Returned by customer',
  adjustment: 'Adjustment (lost / damaged / used)',
};
const RANK = { out: 0, low: 1, uncounted: 2, ok: 3 };

export default function InventoryPage() {
  const [levels, setLevels] = useState([]);
  const [allItems, setAllItems] = useState([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [modal, setModal] = useState(null); // { mode: 'count'|'move'|'history'|'track'|'sizes', item }
  const [flash, setFlash] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const [{ data: l }, { data: it }] = await Promise.all([
      fetchAll(() => supabase.from('inventory_levels').select('*').order('name')),
      fetchAll(() => supabase.from('fee_items').select('id, name, description, track_inventory, active, sizes, low_stock_at').order('name')),
    ]);
    const rows = (l || []).filter((x) => x.active !== false);
    setLevels(rows);
    setAllItems(it || []);
    // Low stock → "Order …" on the Home To-do (and cleared once restocked).
    syncStockTodos(l || []).then(refreshBadges);
  }

  // One entry per item, with its sizes underneath.
  const groups = useMemo(() => {
    const m = new Map();
    levels.forEach((r) => {
      if (!m.has(r.fee_item_id)) m.set(r.fee_item_id, { ...r, rows: [] });
      m.get(r.fee_item_id).rows.push(r);
    });
    return [...m.values()]
      .map((g) => {
        g.rows.sort((a, b) => (a.size_order ?? 0) - (b.size_order ?? 0));
        const sized = g.rows.some((r) => r.size);
        const counted = g.inventory_since != null;
        const total = counted ? g.rows.reduce((t, r) => t + Number(r.on_hand || 0), 0) : null;
        const worst = g.rows.map(status).sort((a, b) => RANK[a] - RANK[b])[0];
        return { ...g, sized, total, worst, sold30: g.rows.reduce((t, r) => t + Number(r.sold_30d || 0), 0), last: g.rows.map((r) => r.last_sold).filter(Boolean).sort().pop() || '' };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [levels]);

  const counts = useMemo(() => {
    const c = { uncounted: 0, out: 0, low: 0 };
    groups.forEach((g) => (g.inventory_since == null ? c.uncounted++ : null));
    levels.forEach((r) => { const s = status(r); if (s === 'out' || s === 'low') c[s]++; });
    return c;
  }, [groups, levels]);

  const filtered = useMemo(() => {
    const k = search.trim().toLowerCase();
    return groups.filter((g) => {
      if (filter === 'uncounted' && g.inventory_since != null) return false;
      if ((filter === 'low' || filter === 'out') && !g.rows.some((r) => status(r) === filter)) return false;
      return !k || matchScore(k, g.name + ' ' + (g.description || '')) !== null;
    });
  }, [groups, search, filter]);

  const stockValue = levels.reduce((t, r) => t + (r.on_hand > 0 ? r.on_hand * Number(r.default_amount || 0) : 0), 0);
  const done = (m) => { setModal(null); setFlash(m); load(); };

  return (
    <>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Inventory</h1>
          <p style={styles.subtitle}>Stock on hand for gear, uniforms and belts, by size · goes down automatically when you invoice them</p>
        </div>
        <button className="dp-btn" onClick={() => setModal({ mode: 'track' })}><Plus size={15} /> Choose Items to Track</button>
      </div>
      {flash && <p style={{ background: '#E8F1E9', color: '#2A5A30', padding: '8px 12px', borderRadius: 6, fontSize: 13, margin: '0 0 12px' }}>{flash}</p>}

      <div className="dp-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}>
        <Metric label="Items tracked" value={groups.length} />
        <Metric label="Not counted yet" value={counts.uncounted} tone={counts.uncounted ? 'warn' : ''} onClick={() => setFilter('uncounted')} />
        <Metric label="Low / out of stock (incl. sizes)" value={counts.low + counts.out} tone={counts.low + counts.out ? 'bad' : ''} onClick={() => setFilter(counts.out ? 'out' : 'low')} />
        <Metric label="Stock value (at selling price)" value={money(stockValue)} />
      </div>

      {counts.uncounted > 0 && (
        <p style={{ fontSize: 13, color: '#5C3A07', background: '#FAEEDA', border: '1px solid #F0D9A8', borderRadius: 8, padding: '8px 12px', margin: '0 0 14px' }}>
          Click <b>Count</b> on each item and enter how many you have right now (per size for sized gear). Stock is tracked from that moment on.
        </p>
      )}
      {counts.low + counts.out > 0 && (
        <p style={{ fontSize: 13, color: '#7A1F1F', background: '#FBEAEA', border: '1px solid #F0C9C9', borderRadius: 8, padding: '8px 12px', margin: '0 0 14px' }}>
          Running low — an <b>Order</b> reminder has been added to the To-do on Home for each item/size. It clears itself once you record the new stock.
        </p>
      )}

      <div style={{ ...styles.filterBar, alignItems: 'center' }}>
        <div style={styles.searchBox}>
          <Search size={15} color="#8A8D84" />
          <input style={{ border: 'none', outline: 'none', padding: '6px 0', fontSize: 14, flex: 1, fontFamily: 'inherit' }} placeholder="Find item…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="dp-select" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All</option>
          <option value="low">Low stock</option>
          <option value="out">Out of stock</option>
          <option value="uncounted">Not counted yet</option>
        </select>
      </div>

      <div style={styles.card}>
        {filtered.length === 0 ? (
          <p style={{ padding: 20, color: '#5B5F56', fontSize: 14 }}>{levels.length ? 'No matching items.' : 'No items are being tracked. Click "Choose Items to Track".'}</p>
        ) : (
          <table className="dp-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>On hand by size</th>
                <th style={{ textAlign: 'right' }}>Price</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th style={{ textAlign: 'right' }}>Sold (30 days)</th>
                <th>Last sold</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((g) => {
                const color = g.worst === 'out' ? '#9A2B2B' : g.worst === 'low' ? '#854F0B' : '#20241F';
                return (
                  <tr key={g.fee_item_id} className="dp-row" data-item={g.name}>
                    <td style={{ fontWeight: 500 }}>
                      {g.name}
                      {g.description && g.description !== g.name && <div style={{ fontSize: 12, color: '#8A8D84', fontWeight: 400 }}>{g.description}</div>}
                    </td>
                    <td>
                      {g.inventory_since == null ? (
                        <span style={{ color: '#8A8D84', fontSize: 13 }}>not counted{g.sized ? ` · sizes ${g.rows.map((r) => r.size).join(' / ')}` : ''}</span>
                      ) : g.sized ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {g.rows.map((r) => <SizeChip key={r.size} r={r} />)}
                        </div>
                      ) : (
                        <span style={{ fontSize: 12.5, color: '#8A8D84' }}>no sizes</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>{money(g.default_amount)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color }}>
                      {g.total === null ? '—' : g.total}
                      {!g.sized && g.worst === 'low' && <span style={{ fontSize: 11, fontWeight: 400 }}> low</span>}
                    </td>
                    <td style={{ textAlign: 'right' }}>{g.sold30 || ''}</td>
                    <td style={{ color: '#5B5F56' }}>{g.last}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <button className="dp-btn" style={{ padding: '3px 8px', fontSize: 12 }} onClick={() => setModal({ mode: 'count', item: g })}><ClipboardCheck size={13} /> Count</button>
                        <button className="dp-btn" style={{ padding: '3px 8px', fontSize: 12 }} disabled={g.inventory_since == null} title={g.inventory_since == null ? 'Count it first' : ''} onClick={() => setModal({ mode: 'move', item: g })}>+ / −</button>
                        <button className="dp-btn" style={{ padding: '3px 8px', fontSize: 12 }} title="Sizes" onClick={() => setModal({ mode: 'sizes', item: g })}><Ruler size={13} /> Sizes</button>
                        <button className="dp-btn" style={{ padding: '3px 8px', fontSize: 12 }} onClick={() => setModal({ mode: 'history', item: g })}>History</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {modal?.mode === 'count' && <CountModal item={modal.item} onClose={() => setModal(null)} onDone={done} />}
      {modal?.mode === 'move' && <MoveModal item={modal.item} onClose={() => setModal(null)} onDone={done} />}
      {modal?.mode === 'history' && <HistoryModal item={modal.item} onClose={() => setModal(null)} />}
      {modal?.mode === 'sizes' && <SizesModal item={modal.item} onClose={() => setModal(null)} onDone={done} />}
      {modal?.mode === 'track' && <TrackModal items={allItems} onClose={() => setModal(null)} onDone={done} />}
    </>
  );
}

function SizeChip({ r }) {
  const st = status(r);
  const c = st === 'out' ? ['#FBEAEA', '#9A2B2B'] : st === 'low' ? ['#FAEEDA', '#854F0B'] : ['#F1EFE7', '#20241F'];
  return (
    <span data-size={r.size} data-status={st} style={{ background: c[0], color: c[1], borderRadius: 6, padding: '2px 7px', fontSize: 12, whiteSpace: 'nowrap' }}>
      <span style={{ color: '#8A8D84' }}>{r.size || '—'}</span> <b style={{ fontWeight: 600 }}>{r.on_hand === null ? '–' : Number(r.on_hand)}</b>
    </span>
  );
}

function Metric({ label, value, tone, onClick }) {
  const color = tone === 'bad' ? '#9A2B2B' : tone === 'warn' ? '#854F0B' : '#20241F';
  return (
    <div style={{ ...styles.metricCard, cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
      <p style={styles.metricLabel}>{label}</p>
      <p style={{ ...styles.metricValue, color }}>{value}</p>
    </div>
  );
}

// Physical count: sets on-hand to exactly what's on the shelf (each size).
function CountModal({ item, onClose, onDone }) {
  const first = item.inventory_since == null;
  const [qty, setQty] = useState(() => Object.fromEntries(item.rows.map((r) => [r.size, r.on_hand ?? ''])));
  const [low, setLow] = useState(item.low_stock_at ?? '');
  const [error, setError] = useState('');
  const sized = item.rows.some((r) => r.size);
  async function save() {
    for (const r of item.rows) {
      const n = Number(qty[r.size]);
      if (qty[r.size] === '' || !Number.isFinite(n) || n < 0) return setError(sized ? `Enter how many you have in size ${r.size} (0 or more).` : 'Enter how many you have (0 or more).');
    }
    const lowVal = low === '' ? null : Number(low);
    const patch = first ? { inventory_since: new Date().toISOString(), low_stock_at: lowVal } : { low_stock_at: lowVal };
    const { error: e1 } = await supabase.from('fee_items').update(patch).eq('id', item.fee_item_id);
    if (e1) return setError(e1.message);
    const moves = item.rows
      .map((r) => {
        const n = Number(qty[r.size]);
        const start = first || r.on_hand === null; // first count for this size
        const diff = start ? n : n - Number(r.on_hand || 0);
        return diff === 0 && !start ? null : { fee_item_id: item.fee_item_id, size: r.size || '', kind: 'count', quantity: diff, note: start ? 'Starting count' : `Counted ${n} (was ${r.on_hand})`, movement_date: localISO() };
      })
      .filter(Boolean);
    if (moves.length) {
      const { error: e2 } = await supabase.from('inventory_movements').insert(moves);
      if (e2) return setError(e2.message);
    }
    const total = item.rows.reduce((t, r) => t + Number(qty[r.size] || 0), 0);
    onDone(`${item.name}: ${total} on hand${sized ? ' (' + item.rows.map((r) => `${r.size}: ${Number(qty[r.size])}`).join(', ') + ')' : ''}.`);
  }
  return (
    <Modal title={`Count — ${item.name}`} onClose={onClose} maxWidth={460} footer={<><button className="dp-btn" onClick={onClose}>Cancel</button><button className="dp-btn dp-btn-primary" onClick={save}><Check size={15} /> Save</button></>}>
      <p style={{ fontSize: 13, color: '#5B5F56', marginTop: 0 }}>{first ? 'How many do you have right now? Tracking starts from this count.' : 'Enter what you actually counted.'}</p>
      {sized ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 8, marginBottom: 12 }}>
          {item.rows.map((r, i) => (
            <label key={r.size} style={{ fontSize: 12.5, color: '#5B5F56' }}>
              Size <b style={{ color: '#20241F' }}>{r.size || '(none)'}</b>
              {!first && <span style={{ color: '#8A8D84' }}> · {r.on_hand === null ? 'new' : `was ${r.on_hand}`}</span>}
              <input type="number" min="0" autoFocus={i === 0} aria-label={`Size ${r.size}`} className="dp-input" style={{ width: '100%', marginTop: 3 }} value={qty[r.size]} onChange={(e) => setQty((q) => ({ ...q, [r.size]: e.target.value }))} />
            </label>
          ))}
        </div>
      ) : (
        <Field label={first ? 'On hand now' : `On hand now (system says ${item.rows[0].on_hand})`} required><input type="number" min="0" autoFocus className="dp-input" style={{ width: '100%' }} value={qty['']} onChange={(e) => setQty({ '': e.target.value })} /></Field>
      )}
      <Field label={sized ? 'Warn me when any size is at or below' : 'Warn me when stock is at or below'}><input type="number" min="0" className="dp-input" style={{ width: '100%' }} placeholder="e.g. 3" value={low} onChange={(e) => setLow(e.target.value)} /></Field>
      {error && <p style={{ color: '#9A2B2B', fontSize: 13 }}>{error}</p>}
    </Modal>
  );
}

function MoveModal({ item, onClose, onDone }) {
  const sized = item.rows.some((r) => r.size);
  const [kind, setKind] = useState('received');
  const [size, setSize] = useState(sized ? '' : '');
  const [qty, setQty] = useState('');
  const [date, setDate] = useState(localISO());
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  async function save() {
    const n = Number(qty);
    if (sized && !size) return setError('Pick the size.');
    if (!n) return setError('Enter a quantity.');
    const signed = kind === 'adjustment' ? -Math.abs(n) : Math.abs(n);
    const { error: e } = await supabase.from('inventory_movements').insert({ fee_item_id: item.fee_item_id, size: size || '', kind, quantity: signed, movement_date: date, note: note || null });
    if (e) return setError(e.message);
    onDone(`${itemWithSize(item.name, size)}: ${signed > 0 ? '+' : ''}${signed} (${KINDS[kind].split(' (')[0].toLowerCase()}).`);
  }
  return (
    <Modal title={`Stock in / out — ${item.name}`} onClose={onClose} maxWidth={440} footer={<><button className="dp-btn" onClick={onClose}>Cancel</button><button className="dp-btn dp-btn-primary" onClick={save}><Check size={15} /> Save</button></>}>
      <Field label="Type">
        <select className="dp-select" style={{ width: '100%' }} value={kind} onChange={(e) => setKind(e.target.value)}>
          {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      {sized && (
        <Field label="Size" required>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {item.rows.map((r) => (
              <button key={r.size} type="button" className={`dp-btn${size === r.size ? ' dp-btn-primary' : ''}`} style={{ padding: '4px 10px' }} onClick={() => setSize(r.size)}>
                {r.size} <span style={{ fontSize: 11, opacity: 0.7 }}>({r.on_hand})</span>
              </button>
            ))}
          </div>
        </Field>
      )}
      <div style={styles.formRow}>
        <Field label={kind === 'adjustment' ? 'Quantity removed' : 'Quantity added'} required><input type="number" min="1" autoFocus className="dp-input" style={{ width: '100%' }} value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
        <Field label="Date"><input type="date" className="dp-input" style={{ width: '100%' }} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <Field label="Note"><input className="dp-input" style={{ width: '100%' }} placeholder="Supplier, order #, reason…" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <p style={{ fontSize: 12.5, color: '#8A8D84', margin: 0 }}>Sales come off automatically when the item is on an invoice — no need to enter them here.</p>
      {error && <p style={{ color: '#9A2B2B', fontSize: 13 }}>{error}</p>}
    </Modal>
  );
}

function HistoryModal({ item, onClose }) {
  const [rows, setRows] = useState(null);
  const sized = item.rows.some((r) => r.size);
  useEffect(() => {
    (async () => {
      const [{ data: mv }, { data: ln }] = await Promise.all([
        supabase.from('inventory_movements').select('*').eq('fee_item_id', item.fee_item_id),
        supabase.from('invoice_lines').select('quantity, size, invoices!inner(invoice_number, invoice_date, customer_name, voided, created_at)').eq('fee_item_id', item.fee_item_id),
      ]);
      const since = item.inventory_since;
      const list = [
        ...(mv || []).map((m) => ({ key: 'm' + m.id, date: m.movement_date, size: m.size || '', what: KINDS[m.kind] || 'Count', who: m.note || '', qty: Number(m.quantity) })),
        ...(ln || [])
          .filter((l) => l.invoices && !l.invoices.voided && since && l.invoices.created_at >= since)
          .map((l, i) => ({ key: 'l' + i, date: l.invoices.invoice_date, size: l.size || '', what: `Sold · invoice #${l.invoices.invoice_number}`, who: l.invoices.customer_name, qty: -Number(l.quantity) })),
      ].sort((a, b) => (a.date < b.date ? 1 : -1));
      setRows(list);
    })();
  }, [item.fee_item_id]);
  return (
    <Modal title={`History — ${item.name}`} onClose={onClose} maxWidth={680}>
      {!rows ? <p style={{ fontSize: 14, color: '#5B5F56' }}>Loading…</p> : rows.length === 0 ? <p style={{ fontSize: 14, color: '#5B5F56' }}>Nothing yet.</p> : (
        <table className="dp-table">
          <thead><tr><th>Date</th>{sized && <th>Size</th>}<th>What</th><th>Who / note</th><th style={{ textAlign: 'right' }}>Qty</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>{formatDate(r.date)}</td>
                {sized && <td>{r.size || <span style={{ color: '#9A2B2B' }}>no size</span>}</td>}
                <td>{r.what}</td>
                <td style={{ color: '#5B5F56' }}>{r.who}</td>
                <td style={{ textAlign: 'right', color: r.qty < 0 ? '#9A2B2B' : '#2A5A30', fontWeight: 500 }}>{r.qty > 0 ? '+' : ''}{r.qty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}

// Which sizes an item comes in. Stock already counted under a size you
// remove stays visible (so nothing disappears) until it's adjusted to 0.
function SizesModal({ item, onClose, onDone }) {
  const [list, setList] = useState(() => (item.sizes || []).join(', '));
  const [error, setError] = useState('');
  const parsed = list.split(/[,\s/]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);
  async function save() {
    if (new Set(parsed).size !== parsed.length) return setError('A size is listed twice.');
    const { error: e } = await supabase.from('fee_items').update({ sizes: parsed.length ? parsed : null }).eq('id', item.fee_item_id);
    if (e) return setError(e.message);
    onDone(parsed.length ? `${item.name}: sizes ${parsed.join(' / ')}.` : `${item.name}: no sizes.`);
  }
  return (
    <Modal title={`Sizes — ${item.name}`} onClose={onClose} maxWidth={460} footer={<><button className="dp-btn" onClick={onClose}>Cancel</button><button className="dp-btn dp-btn-primary" onClick={save}><Check size={15} /> Save</button></>}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {SIZE_PRESETS.map((p) => (
          <button key={p.label} type="button" className="dp-btn" style={{ fontSize: 12.5 }} onClick={() => setList(p.sizes.join(', '))}>{p.label}: {p.sizes.join(' / ')}</button>
        ))}
        <button type="button" className="dp-btn" style={{ fontSize: 12.5 }} onClick={() => setList('')}>No sizes</button>
      </div>
      <Field label="Sizes, in order (comma separated)"><input className="dp-input" style={{ width: '100%' }} placeholder="e.g. S, M, L" value={list} onChange={(e) => setList(e.target.value)} /></Field>
      {item.inventory_since != null && <p style={{ fontSize: 12.5, color: '#8A8D84', margin: 0 }}>After changing sizes, use <b>Count</b> to enter how many you have of each new size.</p>}
      {error && <p style={{ color: '#9A2B2B', fontSize: 13 }}>{error}</p>}
    </Modal>
  );
}

function TrackModal({ items, onClose, onDone }) {
  const [sel, setSel] = useState(() => new Set(items.filter((i) => i.track_inventory).map((i) => i.id)));
  const [q, setQ] = useState('');
  async function save() {
    const on = items.filter((i) => sel.has(i.id) && !i.track_inventory).map((i) => i.id);
    const off = items.filter((i) => !sel.has(i.id) && i.track_inventory).map((i) => i.id);
    if (on.length) await supabase.from('fee_items').update({ track_inventory: true }).in('id', on);
    if (off.length) await supabase.from('fee_items').update({ track_inventory: false }).in('id', off);
    onDone(`Tracking ${sel.size} items.`);
  }
  const shown = items.filter((i) => i.active !== false && (!q || (i.name + ' ' + (i.description || '')).toLowerCase().includes(q.toLowerCase())));
  return (
    <Modal title="Choose Items to Track" onClose={onClose} maxWidth={520} footer={<><button className="dp-btn" onClick={onClose}>Cancel</button><button className="dp-btn dp-btn-primary" onClick={save}><Check size={15} /> Save</button></>}>
      <input className="dp-input" style={{ width: '100%', marginBottom: 10 }} placeholder="Find item…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div style={{ maxHeight: 380, overflowY: 'auto', border: '1px solid #EDEAE0', borderRadius: 6, padding: 6 }}>
        {shown.map((i) => (
          <label key={i.id} style={{ display: 'flex', gap: 8, fontSize: 13, padding: '3px 2px' }}>
            <input type="checkbox" checked={sel.has(i.id)} onChange={(e) => { const s = new Set(sel); e.target.checked ? s.add(i.id) : s.delete(i.id); setSel(s); }} />
            <span style={{ fontWeight: 500 }}>{i.name}</span>
            <span style={{ color: '#8A8D84' }}>{i.description}</span>
          </label>
        ))}
      </div>
      <p style={{ fontSize: 12.5, color: '#8A8D84', margin: '8px 0 0' }}>Turn tracking on for things you keep in stock (gear, uniforms, belts). Fees and plans don't need it.</p>
    </Modal>
  );
}
