import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Download } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import { money, PERIODS, periodRange, INVOICE_STATUS_STYLES, downloadCSV } from '../../lib/invoiceUtils';
import { loadSettings, loadCustomers, loadItems, fetchAll } from './api';
import InvoiceEditor from './InvoiceEditor';
import InvoicePreview from './InvoicePreview';
import PaymentModal from './PaymentModal';

export function StatusPill({ status }) {
  const st = INVOICE_STATUS_STYLES[status] || INVOICE_STATUS_STYLES['Not Paid'];
  return <span style={{ background: st.bg, color: st.text, border: `1px solid ${st.border}`, borderRadius: 999, padding: '1px 9px', fontSize: 12 }}>{status}</span>;
}

export default function InvoicesPage() {
  const [settings, setSettings] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [items, setItems] = useState([]);
  const [students, setStudents] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [period, setPeriod] = useState('this_month');
  const [range, setRange] = useState(periodRange('this_month'));
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('recorded');

  const [editor, setEditor] = useState(null); // { editing } | null
  const [previewId, setPreviewId] = useState(null);
  const [payFor, setPayFor] = useState(null);
  const [flash, setFlash] = useState('');

  useEffect(() => {
    (async () => {
      const [s, c, it, { data: st }] = await Promise.all([loadSettings(), loadCustomers(), loadItems(), supabase.from('students').select('id, name, class_name, tuition, customer_id, status').order('name')]);
      setSettings(s);
      setCustomers(c);
      setItems(it);
      setStudents(st || []);
    })();
  }, []);

  useEffect(() => {
    loadInvoices();
  }, [range.start, range.end]);

  async function loadInvoices() {
    setLoading(true);
    const { data, error } = await fetchAll(() =>
      supabase
        .from('invoice_summary')
        .select('*')
        .gte('invoice_date', range.start)
        .lte('invoice_date', range.end)
        .order('invoice_date', { ascending: false })
        .order('invoice_number', { ascending: false })
    );
    if (error) setLoadError(error.message.includes('invoice_summary') ? 'The invoicing tables are not set up yet — run supabase/migrations/005_invoicing.sql in the Supabase SQL Editor.' : error.message);
    else setLoadError('');
    setInvoices(data || []);
    setLoading(false);
  }

  function changePeriod(id) {
    setPeriod(id);
    if (id !== 'custom') setRange(periodRange(id));
  }

  const filtered = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    return invoices.filter((i) => {
      if (statusFilter === 'recorded' && i.voided) return false;
      if (statusFilter === 'unpaid' && (i.voided || Number(i.balance) <= 0)) return false;
      if (statusFilter === 'paid' && i.status !== 'Paid') return false;
      if (statusFilter === 'void' && !i.voided) return false;
      if (!k) return true;
      return String(i.invoice_number).includes(k) || (i.customer_name || '').toLowerCase().includes(k) || (i.notes || '').toLowerCase().includes(k);
    });
  }, [invoices, keyword, statusFilter]);

  const totals = useMemo(() => {
    const live = filtered.filter((i) => !i.voided);
    const sales = live.filter((i) => !i.is_opening_balance);
    return {
      total: sales.reduce((s, i) => s + Number(i.total), 0),
      gst: sales.reduce((s, i) => s + Number(i.gst_amount), 0),
      owing: live.reduce((s, i) => s + Number(i.balance), 0),
    };
  }, [filtered]);

  async function refreshSettings() {
    setSettings(await loadSettings());
  }

  async function onSaved(invoice, action) {
    setEditor(null);
    setFlash(action === 'email' ? `Invoice #${invoice.invoice_number} saved and queued for email.` : `Invoice #${invoice.invoice_number} saved.`);
    await Promise.all([loadInvoices(), refreshSettings()]);
    setPreviewId(invoice.id);
  }

  function exportCSV() {
    downloadCSV(`invoices_${range.start}_to_${range.end}.csv`, [
      ['Date', 'Invoice', 'Customer', 'Subtotal', 'GST', 'Total', 'Paid', 'Balance', 'Status'],
      ...filtered.map((i) => [i.invoice_date, i.invoice_number, i.customer_name, i.subtotal, i.gst_amount, i.total, i.amount_paid, i.balance, i.status]),
    ]);
  }

  return (
    <>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Invoices</h1>
          <p style={styles.subtitle}>Create, email and track invoices</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="dp-btn" onClick={exportCSV}><Download size={15} /> Export</button>
          <button className="dp-btn dp-btn-primary" disabled={!settings} onClick={() => setEditor({ editing: null })}><Plus size={15} /> New Invoice</button>
        </div>
      </div>

      {flash && <p style={{ background: '#E8F1E9', color: '#2A5A30', padding: '8px 12px', borderRadius: 6, fontSize: 13, margin: '0 0 12px' }}>{flash}</p>}
      {loadError && <p style={{ background: '#FBEAEA', color: '#9A2B2B', padding: '8px 12px', borderRadius: 6, fontSize: 13, margin: '0 0 12px' }}>{loadError}</p>}

      <div style={{ ...styles.filterBar, flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="dp-select" value={period} onChange={(e) => changePeriod(e.target.value)}>
          {PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <input type="date" className="dp-input" value={range.start} onChange={(e) => { setPeriod('custom'); setRange({ ...range, start: e.target.value }); }} />
        <span style={{ color: '#5B5F56', fontSize: 13 }}>to</span>
        <input type="date" className="dp-input" value={range.end} onChange={(e) => { setPeriod('custom'); setRange({ ...range, end: e.target.value }); }} />
        <div style={styles.searchBox}>
          <Search size={15} color="#8A8D84" />
          <input style={{ border: 'none', outline: 'none', padding: '6px 0', fontSize: 14, flex: 1, fontFamily: 'inherit' }} placeholder="Invoice #, customer…" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        </div>
        <select className="dp-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="recorded">Recorded</option>
          <option value="unpaid">Unpaid</option>
          <option value="paid">Paid</option>
          <option value="void">Void</option>
          <option value="all">All</option>
        </select>
      </div>

      <div style={styles.card}>
        {loading ? (
          <p style={{ padding: 20, color: '#5B5F56', fontSize: 14 }}>Loading…</p>
        ) : filtered.length === 0 ? (
          <p style={{ padding: 20, color: '#5B5F56', fontSize: 14 }}>No invoices in this period.</p>
        ) : (
          <table className="dp-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Invoice</th>
                <th>Customer</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th style={{ textAlign: 'right' }}>Due</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.id} className="dp-row" style={{ cursor: 'pointer', opacity: i.voided ? 0.55 : 1 }} onClick={() => setPreviewId(i.id)}>
                  <td>{i.invoice_date}</td>
                  <td style={{ fontWeight: 500 }}>{i.is_opening_balance ? <span style={{ color: '#8A8D84', fontWeight: 400 }}>Opening</span> : i.invoice_number}</td>
                  <td>{i.customer_name}</td>
                  <td style={{ textAlign: 'right' }}>{money(i.total)}</td>
                  <td style={{ textAlign: 'right', color: Number(i.balance) > 0 && !i.voided ? '#9A2B2B' : '#8A8D84' }}>{Number(i.balance) > 0 && !i.voided ? money(i.balance) : ''}</td>
                  <td><StatusPill status={i.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ padding: '10px 12px', fontSize: 13, color: '#5B5F56', borderTop: '1px solid #EDEAE0', display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          <span>{filtered.length} invoices</span>
          <span>Total <b style={{ color: '#20241F' }}>{money(totals.total)}</b></span>
          <span>GST {money(totals.gst)}</span>
          <span>Owing <b style={{ color: totals.owing > 0 ? '#9A2B2B' : '#20241F' }}>{money(totals.owing)}</b></span>
        </div>
      </div>

      {editor && settings && (
        <InvoiceEditor
          settings={settings}
          customers={customers}
          items={items}
          students={students}
          editing={editor.editing}
          onClose={() => setEditor(null)}
          onSaved={onSaved}
          onCustomersChanged={async () => setCustomers(await loadCustomers())}
        />
      )}

      {previewId && !editor && !payFor && (
        <InvoicePreview
          invoiceId={previewId}
          settings={settings}
          onClose={() => setPreviewId(null)}
          onEdit={(data) => setEditor({ editing: data })}
          onPay={(inv) => setPayFor({ invoice_id: inv.id, customer_id: inv.customer_id, amount: Number(inv.balance) })}
          onChanged={loadInvoices}
        />
      )}

      {payFor && (
        <PaymentModal
          customers={customers}
          initial={payFor}
          onClose={() => setPayFor(null)}
          onSaved={async (p) => {
            setPayFor(null);
            setFlash(`Payment saved — receipt #${p.receipt_number}.`);
            await loadInvoices();
          }}
        />
      )}
    </>
  );
}
