import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Download, Trash2, Mail } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import ConfirmDialog from '../../components/ConfirmDialog';
import { money, PERIODS, periodRange, downloadCSV } from '../../lib/invoiceUtils';
import { loadCustomers, queueEmail, fetchAll } from './api';
import PaymentModal from './PaymentModal';

export default function PaymentsPage() {
  const [customers, setCustomers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [period, setPeriod] = useState('this_month');
  const [range, setRange] = useState(periodRange('this_month'));
  const [keyword, setKeyword] = useState('');
  const [method, setMethod] = useState('all');
  const [modal, setModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [flash, setFlash] = useState('');

  useEffect(() => {
    loadCustomers().then(setCustomers);
  }, []);
  useEffect(() => {
    load();
  }, [range.start, range.end]);

  async function load() {
    const { data } = await fetchAll(() =>
      supabase
        .from('invoice_payments')
        .select('*, invoices(invoice_number)')
        .gte('payment_date', range.start)
        .lte('payment_date', range.end)
        .order('payment_date', { ascending: false })
        .order('receipt_number', { ascending: false })
    );
    setPayments(data || []);
  }

  const customerMap = useMemo(() => Object.fromEntries(customers.map((c) => [c.id, c])), [customers]);
  const methods = useMemo(() => [...new Set(payments.map((p) => p.method))].sort(), [payments]);

  const filtered = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    return payments.filter((p) => {
      if (method !== 'all' && p.method !== method) return false;
      if (!k) return true;
      const name = customerMap[p.customer_id]?.name || '';
      return name.toLowerCase().includes(k) || String(p.receipt_number).includes(k) || String(p.invoices?.invoice_number || '').includes(k) || (p.reference || '').toLowerCase().includes(k);
    });
  }, [payments, keyword, method, customerMap]);

  const byMethod = useMemo(() => {
    const m = {};
    filtered.forEach((p) => (m[p.method] = (m[p.method] || 0) + Number(p.amount)));
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [filtered]);
  const total = filtered.reduce((s, p) => s + Number(p.amount), 0);

  async function del(id) {
    await supabase.from('invoice_payments').delete().eq('id', id);
    setConfirmDel(null);
    load();
  }
  async function emailReceipt(p) {
    const c = customerMap[p.customer_id];
    if (!c?.email) return setFlash('This customer has no email address.');
    await queueEmail('receipt', c.email, { payment_id: p.id });
    setFlash(`Receipt #${p.receipt_number} queued to ${c.email}.`);
  }

  function exportCSV() {
    downloadCSV(`payments_${range.start}_to_${range.end}.csv`, [
      ['Date', 'Receipt', 'Customer', 'Method', 'Amount', 'Invoice', 'Payment Ref'],
      ...filtered.map((p) => [p.payment_date, p.receipt_number, customerMap[p.customer_id]?.name || '', p.method, p.amount, p.invoices?.invoice_number || '', p.reference || '']),
    ]);
  }

  return (
    <>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Payments</h1>
          <p style={styles.subtitle}>Money received, with receipt numbers</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="dp-btn" onClick={exportCSV}><Download size={15} /> Export</button>
          <button className="dp-btn dp-btn-primary" onClick={() => setModal({})}><Plus size={15} /> Apply Payment</button>
        </div>
      </div>
      {flash && <p style={{ background: '#E8F1E9', color: '#2A5A30', padding: '8px 12px', borderRadius: 6, fontSize: 13, margin: '0 0 12px' }}>{flash}</p>}

      <div style={{ ...styles.filterBar, flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="dp-select" value={period} onChange={(e) => { setPeriod(e.target.value); if (e.target.value !== 'custom') setRange(periodRange(e.target.value)); }}>
          {PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <input type="date" className="dp-input" value={range.start} onChange={(e) => { setPeriod('custom'); setRange({ ...range, start: e.target.value }); }} />
        <span style={{ color: '#5B5F56', fontSize: 13 }}>to</span>
        <input type="date" className="dp-input" value={range.end} onChange={(e) => { setPeriod('custom'); setRange({ ...range, end: e.target.value }); }} />
        <div style={styles.searchBox}>
          <Search size={15} color="#8A8D84" />
          <input style={{ border: 'none', outline: 'none', padding: '6px 0', fontSize: 14, flex: 1, fontFamily: 'inherit' }} placeholder="Customer, receipt, invoice…" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        </div>
        <select className="dp-select" value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="all">All methods</option>
          {methods.map((m) => <option key={m}>{m}</option>)}
        </select>
      </div>

      <div style={styles.card}>
        {filtered.length === 0 ? (
          <p style={{ padding: 20, color: '#5B5F56', fontSize: 14 }}>No payments in this period.</p>
        ) : (
          <table className="dp-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Receipt</th>
                <th>Customer</th>
                <th>Method</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th>Invoice</th>
                <th>Payment Ref</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="dp-row" style={{ cursor: 'pointer' }} onClick={() => setModal(p)}>
                  <td>{p.payment_date}</td>
                  <td style={{ fontWeight: 500 }}>{p.receipt_number}</td>
                  <td>{customerMap[p.customer_id]?.name || ''}</td>
                  <td>{p.method}</td>
                  <td style={{ textAlign: 'right' }}>{money(p.amount)}</td>
                  <td>{p.invoices?.invoice_number || ''}</td>
                  <td style={{ color: '#5B5F56' }}>{p.reference}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="dp-btn" style={{ padding: 5 }} aria-label="Email receipt" title="Email receipt" onClick={() => emailReceipt(p)}><Mail size={13} /></button>
                      <button className="dp-btn dp-btn-danger" style={{ padding: 5 }} aria-label="Delete" onClick={() => setConfirmDel(p)}><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ padding: '10px 12px', fontSize: 13, color: '#5B5F56', borderTop: '1px solid #EDEAE0', display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          <span>{filtered.length} payments · Total <b style={{ color: '#20241F' }}>{money(total)}</b></span>
          {byMethod.map(([m, v]) => <span key={m}>{m}: {money(v)}</span>)}
        </div>
      </div>

      {modal && (
        <PaymentModal
          customers={customers}
          initial={modal.id ? modal : null}
          onClose={() => setModal(null)}
          onSaved={(p) => {
            setModal(null);
            setFlash(`Payment saved — receipt #${p.receipt_number}.`);
            load();
          }}
        />
      )}
      {confirmDel && <ConfirmDialog message={`Delete receipt #${confirmDel.receipt_number} (${money(confirmDel.amount)})? The invoice will show as unpaid again.`} onCancel={() => setConfirmDel(null)} onConfirm={() => del(confirmDel.id)} />}
    </>
  );
}
