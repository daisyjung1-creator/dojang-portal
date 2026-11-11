import React, { useEffect, useState } from 'react';
import { Search, Download } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import { money, formatDate, downloadCSV, PERIODS, periodRange } from '../../lib/invoiceUtils';

// "Who bought this, and when?" — search invoice lines by item or service name
// (uniform, belt test fee, sparring gear, a student's name…).
export default function ItemLookup({ onOpenInvoice }) {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [period, setPeriod] = useState('this_year');
  const [range, setRange] = useState(periodRange('this_year'));
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from('fee_items').select('id, name').eq('active', true).order('name').then(({ data }) => setItems(data || []));
  }, []);

  async function search(text = q) {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    const like = `%${t.replace(/[%_,()]/g, ' ')}%`;
    const { data } = await supabase
      .from('invoice_lines')
      .select('id, item_name, description, quantity, amount, student_id, invoice_id, invoices!inner(invoice_number, invoice_date, customer_name, voided)')
      .or(`item_name.ilike.${like},description.ilike.${like}`)
      .gte('invoices.invoice_date', range.start)
      .lte('invoices.invoice_date', range.end)
      .eq('invoices.voided', false)
      .limit(1000);
    const list = data || [];
    const sids = [...new Set(list.map((l) => l.student_id).filter(Boolean))];
    const iids = [...new Set(list.map((l) => l.invoice_id))];
    const [{ data: st }, { data: sums }] = await Promise.all([
      sids.length ? supabase.from('students').select('id, name').in('id', sids) : { data: [] },
      iids.length ? supabase.from('invoice_summary').select('id, status').in('id', iids.slice(0, 300)) : { data: [] },
    ]);
    const nm = Object.fromEntries((st || []).map((x) => [x.id, x.name]));
    const status = Object.fromEntries((sums || []).map((x) => [x.id, x.status]));
    setRows(
      list
        .map((l) => ({ ...l, date: l.invoices.invoice_date, number: l.invoices.invoice_number, customer: l.invoices.customer_name, student: nm[l.student_id] || '', status: status[l.invoice_id] || '' }))
        .sort((a, b) => (a.date < b.date ? 1 : -1))
    );
    setBusy(false);
  }

  const total = (rows || []).reduce((n, r) => n + Number(r.amount || 0), 0);
  const qty = (rows || []).reduce((n, r) => n + Number(r.quantity || 0), 0);

  return (
    <div style={{ ...styles.card, padding: 16, marginBottom: 18 }}>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Who bought what</div>
      <p style={{ fontSize: 12.5, color: '#5B5F56', margin: '0 0 10px' }}>Search invoices by item or service (e.g. uniform, belt test, sparring gear) to see who bought it and when.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #DEDACC', borderRadius: 8, padding: '0 10px', background: '#fff', flex: '1 1 240px' }}>
          <Search size={14} color="#8A8D84" />
          <input style={{ border: 'none', outline: 'none', padding: '8px 0', fontSize: 14, flex: 1, fontFamily: 'inherit' }} placeholder="Item, service or description…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} />
        </div>
        <select className="dp-select" value={period} onChange={(e) => { setPeriod(e.target.value); if (e.target.value !== 'custom') setRange(periodRange(e.target.value)); }}>
          {PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        {period === 'custom' && (
          <>
            <input type="date" className="dp-input" value={range.start} onChange={(e) => setRange({ ...range, start: e.target.value })} />
            <input type="date" className="dp-input" value={range.end} onChange={(e) => setRange({ ...range, end: e.target.value })} />
          </>
        )}
        <button className="dp-btn dp-btn-primary" disabled={busy || !q.trim()} onClick={() => search()}>{busy ? 'Searching…' : 'Search'}</button>
      </div>
      {items.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
          {items.slice(0, 16).map((it) => (
            <button key={it.id} type="button" className="dp-btn" style={{ padding: '2px 9px', fontSize: 12 }} onClick={() => { setQ(it.name); search(it.name); }}>{it.name}</button>
          ))}
        </div>
      )}
      {rows && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', fontSize: 13, marginBottom: 6 }}>
            <span style={{ flex: 1 }}>{rows.length} line{rows.length === 1 ? '' : 's'} · qty {qty} · {money(total)} before GST</span>
            {rows.length > 0 && (
              <button className="dp-btn" style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => downloadCSV(`purchases-${q.trim().replace(/\W+/g, '-')}.csv`, [['Date', 'Invoice', 'Family', 'Student', 'Item', 'Description', 'Qty', 'Amount', 'Status'], ...rows.map((r) => [r.date, r.number, r.customer, r.student, r.item_name || '', r.description, r.quantity, r.amount, r.status])])}>
                <Download size={12} /> CSV
              </button>
            )}
          </div>
          {rows.length === 0 ? (
            <p style={{ fontSize: 13, color: '#8A8D84' }}>Nothing found for "{q}" in this period.</p>
          ) : (
            <div style={{ maxHeight: 420, overflow: 'auto' }}>
              <table className="dp-table">
                <thead>
                  <tr><th>Date</th><th>Invoice</th><th>Family</th><th>Student</th><th>Item / description</th><th style={{ textAlign: 'right' }}>Qty</th><th style={{ textAlign: 'right' }}>Amount</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="dp-row">
                      <td style={{ whiteSpace: 'nowrap', fontSize: 12.5 }}>{formatDate(r.date)}</td>
                      <td><button style={{ background: 'none', border: 'none', padding: 0, color: '#1E4566', textDecoration: 'underline', cursor: 'pointer', fontSize: 12.5, fontFamily: 'inherit' }} onClick={() => onOpenInvoice && onOpenInvoice(r.invoice_id)}>#{r.number}</button></td>
                      <td style={{ fontSize: 13 }}>{r.customer}</td>
                      <td style={{ fontSize: 13 }}>{r.student || '—'}</td>
                      <td style={{ fontSize: 12.5 }}>{r.item_name && <b>{r.item_name} </b>}<span style={{ color: '#5B5F56' }}>{r.description}</span></td>
                      <td style={{ textAlign: 'right' }}>{r.quantity}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{money(r.amount)}</td>
                      <td style={{ fontSize: 12 }}>{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
