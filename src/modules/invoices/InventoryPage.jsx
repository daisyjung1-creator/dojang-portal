import React, { useEffect, useMemo, useState } from 'react';
import { Search, Plus, ClipboardCheck, Check } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import Field from '../../components/Field';
import Modal from '../../components/Modal';
import { money, localISO, formatDate } from '../../lib/invoiceUtils';
import { fetchAll } from './api';

// Stock on hand for physical items (gear, uniforms, belts…).
// Stock in = received / counted / returned (inventory_movements).
// Stock out = quantities on invoices (worked out automatically, so voiding or
// editing an invoice puts the stock back). Counting starts at the first count.
const KINDS = {
  received: 'Received (new stock)',
  returned: 'Returned by customer',
  adjustment: 'Adjustment (lost / damaged / used)',
};

export default function InventoryPage() {
  const [levels, setLevels] = useState([]);
  const [allItems, setAllItems] = useState([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [modal, setModal] = useState(null); // { mode: 'count'|'move'|'history'|'track', item }
  const [flash, setFlash] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const [{ data: l }, { data: it }] = await Promise.all([
      fetchAll(() => supabase.from('inventory_levels').select('*').order('name')),
      fetchAll(() => supabase.from('fee_items').select('id, name, description, track_inventory, active').order('name')),
    ]);
    setLevels((l || []).filter((x) => x.active !== false));
    setAllItems(it || []);
  }

  const status = (r) => (r.on_hand === null ? 'uncounted' : r.on_hand <= 0 ? 'out' : r.low_stock_at != null && r.on_hand <= r.low_stock_at ? 'low' : 'ok');
  const counts = useMemo(() => {
    const c = { uncounted: 0, out: 0, low: 0 };
    levels.forEach((r) => c[status(r)] !== undefined && c[status(r)]++);
    return c;
  }, [levels]);

  const filtered = useMemo(() => {
    const k = search.trim().toLowerCase();
    return levels.filter((r) => {
      if (filter !== 'all' && status(r) !== filter) return false;
      return !k || (r.name + ' ' + (r.description || '')).toLowerCase().includes(k);
    });
  }, [levels, search, filter]);

  const stockValue = levels.reduce((t, r) => t + (r.on_hand > 0 ? r.on_hand * Number(r.default_amount || 0) : 0), 0);

  return (
    <>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Inventory</h1>
          <p style={styles.subtitle}>Stock on hand for gear, uniforms and belts · goes down automatically when you invoice them</p>
        </div>
        <button className="dp-btn" onClick={() => setModal({ mode: 'track' })}><Plus size={15} /> Choose Items to Track</button>
      </div>
      {flash && <p style={{ background: '#E8F1E9', color: '#2A5A30', padding: '8px 12px', borderRadius: 6, fontSize: 13, margin: '0 0 12px' }}>{flash}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}>
        <Metric label="Items tracked" value={levels.length} />
        <Metric label="Not counted yet" value={counts.uncounted} tone={counts.uncounted ? 'warn' : ''} onClick={() => setFilter('uncounted')} />
        <Metric label="Low / out of stock" value={counts.low + counts.out} tone={counts.low + counts.out ? 'bad' : ''} onClick={() => setFilter(counts.out ? 'out' : 'low')} />
        <Metric label="Stock value (at selling price)" value={money(stockValue)} />
      </div>

      {counts.uncounted > 0 && (
        <p style={{ fontSize: 13, color: '#5C3A07', background: '#FAEEDA', border: '1px solid #F0D9A8', borderRadius: 8, padding: '8px 12px', margin: '0 0 14px' }}>
          Click <b>Count</b> on each item and enter how many you have right now. Stock is tracked from that moment on.
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
                <th>Description</th>
                <th style={{ textAlign: 'right' }}>Price</th>
                <th style={{ textAlign: 'right' }}>On hand</th>
                <th style={{ textAlign: 'right' }}>Sold (30 days)</th>
                <th>Last sold</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const st = status(r);
                const color = st === 'out' ? '#9A2B2B' : st === 'low' ? '#854F0B' : '#20241F';
                return (
                  <tr key={r.fee_item_id} className="dp-row">
                    <td style={{ fontWeight: 500 }}>{r.name}</td>
                    <td style={{ color: '#5B5F56' }}>{r.description}</td>
                    <td style={{ textAlign: 'right' }}>{money(r.default_amount)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color }}>
                      {r.on_hand === null ? <span style={{ color: '#8A8D84', fontWeight: 400 }}>not counted</span> : Number(r.on_hand)}
                      {st === 'low' && <span style={{ fontSize: 11, fontWeight: 400 }}> low</span>}
                    </td>
                    <td style={{ textAlign: 'right' }}>{Number(r.sold_30d) || ''}</td>
                    <td style={{ color: '#5B5F56' }}>{r.last_sold || ''}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <button className="dp-btn" style={{ padding: '3px 8px', fontSize: 12 }} onClick={() => setModal({ mode: 'count', item: r })}><ClipboardCheck size={13} /> Count</button>
                        <button className="dp-btn" style={{ padding: '3px 8px', fontSize: 12 }} disabled={r.on_hand === null} title={r.on_hand === null ? 'Count it first' : ''} onClick={() => setModal({ mode: 'move', item: r })}>+ / −</button>
                        <button className="dp-btn" style={{ padding: '3px 8px', fontSize: 12 }} onClick={() => setModal({ mode: 'history', item: r })}>History</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {modal?.mode === 'count' && <CountModal item={modal.item} onClose={() => setModal(null)} onDone={(m) => { setModal(null); setFlash(m); load(); }} />}
      {modal?.mode === 'move' && <MoveModal item={modal.item} onClose={() => setModal(null)} onDone={(m) => { setModal(null); setFlash(m); load(); }} />}
      {modal?.mode === 'history' && <HistoryModal item={modal.item} onClose={() => setModal(null)} />}
      {modal?.mode === 'track' && <TrackModal items={allItems} onClose={() => setModal(null)} onDone={(m) => { setModal(null); setFlash(m); load(); }} />}
    </>
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

// Physical count: sets on-hand to exactly what's on the shelf.
function CountModal({ item, onClose, onDone }) {
  const [qty, setQty] = useState(item.on_hand ?? '');
  const [low, setLow] = useState(item.low_stock_at ?? '');
  const [error, setError] = useState('');
  async function save() {
    const n = Number(qty);
    if (qty === '' || !Number.isFinite(n) || n < 0) return setError('Enter how many you have (0 or more).');
    if (item.on_hand === null) {
      // First count: start tracking from now with this many in stock.
      const { error: e1 } = await supabase.from('fee_items').update({ inventory_since: new Date().toISOString(), low_stock_at: low === '' ? null : Number(low) }).eq('id', item.fee_item_id);
      if (e1) return setError(e1.message);
      const { error: e2 } = await supabase.from('inventory_movements').insert({ fee_item_id: item.fee_item_id, kind: 'count', quantity: n, note: 'Starting count', movement_date: localISO() });
      if (e2) return setError(e2.message);
    } else {
      const diff = n - Number(item.on_hand);
      await supabase.from('fee_items').update({ low_stock_at: low === '' ? null : Number(low) }).eq('id', item.fee_item_id);
      if (diff !== 0) {
        const { error: e2 } = await supabase.from('inventory_movements').insert({ fee_item_id: item.fee_item_id, kind: 'count', quantity: diff, note: `Counted ${n} (was ${item.on_hand})`, movement_date: localISO() });
        if (e2) return setError(e2.message);
      }
    }
    onDone(`${item.name}: ${n} on hand.`);
  }
  return (
    <Modal title={`Count — ${item.name}`} onClose={onClose} maxWidth={420} footer={<><button className="dp-btn" onClick={onClose}>Cancel</button><button className="dp-btn dp-btn-primary" onClick={save}><Check size={15} /> Save</button></>}>
      <p style={{ fontSize: 13, color: '#5B5F56', marginTop: 0 }}>{item.on_hand === null ? 'How many do you have right now? Tracking starts from this count.' : `System says ${item.on_hand}. Enter what you actually counted.`}</p>
      <Field label="On hand now" required><input type="number" min="0" autoFocus className="dp-input" style={{ width: '100%' }} value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
      <Field label="Warn me when stock is at or below"><input type="number" min="0" className="dp-input" style={{ width: '100%' }} placeholder="e.g. 3" value={low} onChange={(e) => setLow(e.target.value)} /></Field>
      {error && <p style={{ color: '#9A2B2B', fontSize: 13 }}>{error}</p>}
    </Modal>
  );
}

function MoveModal({ item, onClose, onDone }) {
  const [kind, setKind] = useState('received');
  const [qty, setQty] = useState('');
  const [date, setDate] = useState(localISO());
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  async function save() {
    const n = Number(qty);
    if (!n) return setError('Enter a quantity.');
    const signed = kind === 'adjustment' ? -Math.abs(n) : Math.abs(n);
    const { error: e } = await supabase.from('inventory_movements').insert({ fee_item_id: item.fee_item_id, kind, quantity: signed, movement_date: date, note: note || null });
    if (e) return setError(e.message);
    onDone(`${item.name}: ${signed > 0 ? '+' : ''}${signed} (${KINDS[kind].split(' (')[0].toLowerCase()}).`);
  }
  return (
    <Modal title={`Stock in / out — ${item.name}`} onClose={onClose} maxWidth={440} footer={<><button className="dp-btn" onClick={onClose}>Cancel</button><button className="dp-btn dp-btn-primary" onClick={save}><Check size={15} /> Save</button></>}>
      <Field label="Type">
        <select className="dp-select" style={{ width: '100%' }} value={kind} onChange={(e) => setKind(e.target.value)}>
          {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
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
  useEffect(() => {
    (async () => {
      const [{ data: mv }, { data: ln }] = await Promise.all([
        supabase.from('inventory_movements').select('*').eq('fee_item_id', item.fee_item_id),
        supabase.from('invoice_lines').select('quantity, invoices!inner(invoice_number, invoice_date, customer_name, voided, created_at)').eq('fee_item_id', item.fee_item_id),
      ]);
      const since = item.inventory_since;
      const list = [
        ...(mv || []).map((m) => ({ key: 'm' + m.id, date: m.movement_date, what: KINDS[m.kind] || 'Count', who: m.note || '', qty: Number(m.quantity) })),
        ...(ln || [])
          .filter((l) => l.invoices && !l.invoices.voided && since && l.invoices.created_at >= since)
          .map((l, i) => ({ key: 'l' + i, date: l.invoices.invoice_date, what: `Sold · invoice #${l.invoices.invoice_number}`, who: l.invoices.customer_name, qty: -Number(l.quantity) })),
      ].sort((a, b) => (a.date < b.date ? 1 : -1));
      setRows(list);
    })();
  }, [item.fee_item_id]);
  return (
    <Modal title={`History — ${item.name}`} onClose={onClose} maxWidth={640}>
      {!rows ? <p style={{ fontSize: 14, color: '#5B5F56' }}>Loading…</p> : rows.length === 0 ? <p style={{ fontSize: 14, color: '#5B5F56' }}>Nothing yet.</p> : (
        <table className="dp-table">
          <thead><tr><th>Date</th><th>What</th><th>Who / note</th><th style={{ textAlign: 'right' }}>Qty</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>{formatDate(r.date)}</td>
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
