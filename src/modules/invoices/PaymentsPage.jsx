import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Download, Trash2, Mail, RotateCcw } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import ConfirmDialog from '../../components/ConfirmDialog';
import { money, PERIODS, periodRange, downloadCSV } from '../../lib/invoiceUtils';
import { loadCustomers, queueEmail, fetchAll } from './api';
import PaymentModal from './PaymentModal';
import RefundModal from './RefundModal';

// Money in (payments, with receipt numbers) and money out (refunds), like
// Express Invoice's "View Payments" and "View Refunds".
export default function PaymentsPage() {
  const [view, setView] = useState('payments');
  const [customers, setCustomers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [period, setPeriod] = useState('this_month');
  const [range, setRange] = useState(periodRange('this_month'));
  const [keyword, setKeyword] = useState('');
  const [method, setMethod] = useState('all');
  const [modal, setModal] = useState(null);
  const [refundModal, setRefundModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [flash, setFlash] = useState({ text: '', error: false });

  useEffect(() => {
    loadCustomers().then(setCustomers);
  }, []);
  useEffect(() => {
    load();
  }, [range.start, range.end]);

  async function load() {
    const [{ data: p }, { data: r }] = await Promise.all([
      fetchAll(() =>
        supabase
          .from('invoice_payments')
          .select('*, invoices(invoice_number)')
          .gte('payment_date', range.start)
          .lte('payment_date', range.end)
          .order('payment_date', { ascending: false })
          .order('receipt_number', { ascending: false })
      ),
      fetchAll(() =>
        supabase
          .from('invoice_refunds')
          .select('*, invoices(invoice_number)')
          .gte('refund_date', range.start)
          .lte('refund_date', range.end)
          .order('refund_date', { ascending: false })
          .order('refund_number', { ascending: false })
      ),
    ]);
    setPayments(p || []);
    setRefunds(r || []);
  }

  const say = (text, error = false) => setFlash({ text, error });
  const customerMap = useMemo(() => Object.fromEntries(customers.map((c) => [c.id, c])), [customers]);
  const rows = view === 'payments' ? payments : refunds;
  const methods = useMemo(() => [...new Set(rows.map((p) => p.method))].sort(), [rows]);

  const filtered = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    return rows.filter((p) => {
      if (method !== 'all' && p.method !== method) return false;
      if (!k) return true;
      const name = customerMap[p.customer_id]?.name || '';
      const num = view === 'payments' ? p.receipt_number : p.refund_number;
      return name.toLowerCase().includes(k) || String(num).includes(k) || String(p.invoices?.invoice_number || '').includes(k) || (p.reference || p.reason || '').toLowerCase().includes(k);
    });
  }, [rows, keyword, method, customerMap, view]);

  const byMethod = useMemo(() => {
    const m = {};
    filtered.forEach((p) => (m[p.method] = (m[p.method] || 0) + Number(p.amount)));
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [filtered]);
  const total = filtered.reduce((s, p) => s + Number(p.amount), 0);
  const received = payments.reduce((s, p) => s + Number(p.amount), 0);
  const refunded = refunds.reduce((s, p) => s + Number(p.amount), 0);

  async function del(row) {
    const table = view === 'payments' ? 'invoice_payments' : 'invoice_refunds';
    const { error } = await supabase.from(table).delete().eq('id', row.id);
    setConfirmDel(null);
    if (error) say(error.message, true);
    load();
  }
  async function emailIt(p) {
    const c = customerMap[p.customer_id];
    if (!c?.email) return say('This customer has no email address.', true);
    if (view === 'payments') {
      await queueEmail('receipt', c.email, { payment_id: p.id });
      say(`Receipt #${p.receipt_number} queued to ${c.email}.`);
    } else {
      await queueEmail('refund', c.email, { refund_id: p.id });
      say(`Refund #${p.refund_number} confirmation queued to ${c.email}.`);
    }
  }

  function exportCSV() {
    if (view === 'payments') {
      downloadCSV(`payments_${range.start}_to_${range.end}.csv`, [
        ['Date', 'Receipt', 'Customer', 'Method', 'Amount', 'Invoice', 'Payment Ref'],
        ...filtered.map((p) => [p.payment_date, p.receipt_number, customerMap[p.customer_id]?.name || '', p.method, p.amount, p.invoices?.invoice_number || '', p.reference || '']),
      ]);
    } else {
      downloadCSV(`refunds_${range.start}_to_${range.end}.csv`, [
        ['Date', 'Refund', 'Customer', 'Method', 'Amount', 'GST portion', 'Invoice', 'Reason'],
        ...filtered.map((r) => [r.refund_date, r.refund_number, customerMap[r.customer_id]?.name || '', r.method, r.amount, r.gst_amount, r.invoices?.invoice_number || '', r.reason || '']),
      ]);
    }
  }

  const tab = (id, label) => (
    <button
      key={id}
      className="dp-btn"
      style={{ background: view === id ? '#20241F' : '#FFFFFF', color: view === id ? '#FFFFFF' : '#20241F', borderColor: view === id ? '#20241F' : '#DEDACC' }}
      onClick={() => {
        setView(id);
        setMethod('all');
      }}
    >
      {label}
    </button>
  );

  return (
    <>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Payments</h1>
          <p style={styles.subtitle}>Money received and refunded · this period: in {money(received)} · out {money(refunded)} · net {money(received - refunded)}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="dp-btn" onClick={exportCSV}><Download size={15} /> Export</button>
          <button className="dp-btn" onClick={() => setRefundModal({})}><RotateCcw size={15} /> Refund</button>
          <button className="dp-btn dp-btn-primary" onClick={() => setModal({})}><Plus size={15} /> Apply Payment</button>
        </div>
      </div>
      {flash.text && <p style={{ background: flash.error ? '#FBEAEA' : '#E8F1E9', color: flash.error ? '#9A2B2B' : '#2A5A30', padding: '8px 12px', borderRadius: 6, fontSize: 13, margin: '0 0 12px' }}>{flash.text}</p>}

      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {tab('payments', `Payments (${payments.length})`)}
        {tab('refunds', `Refunds (${refunds.length})`)}
      </div>

      <div style={{ ...styles.filterBar, flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="dp-select" value={period} onChange={(e) => { setPeriod(e.target.value); if (e.target.value !== 'custom') setRange(periodRange(e.target.value)); }}>
          {PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <input type="date" className="dp-input" value={range.start} onChange={(e) => { setPeriod('custom'); setRange({ ...range, start: e.target.value }); }} />
        <span style={{ color: '#5B5F56', fontSize: 13 }}>to</span>
        <input type="date" className="dp-input" value={range.end} onChange={(e) => { setPeriod('custom'); setRange({ ...range, end: e.target.value }); }} />
        <div style={styles.searchBox}>
          <Search size={15} color="#8A8D84" />
          <input style={{ border: 'none', outline: 'none', padding: '6px 0', fontSize: 14, flex: 1, fontFamily: 'inherit' }} placeholder={view === 'payments' ? 'Customer, receipt, invoice…' : 'Customer, refund #, invoice, reason…'} value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        </div>
        <select className="dp-select" value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="all">All methods</option>
          {methods.map((m) => <option key={m}>{m}</option>)}
        </select>
      </div>

      <div style={styles.card}>
        {filtered.length === 0 ? (
          <p style={{ padding: 20, color: '#5B5F56', fontSize: 14 }}>{view === 'payments' ? 'No payments in this period.' : 'No refunds in this period.'}</p>
        ) : (
          <table className="dp-table">
            <thead>
              {view === 'payments' ? (
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
              ) : (
                <tr>
                  <th>Date</th>
                  <th>Refund</th>
                  <th>Customer</th>
                  <th>Method</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th style={{ textAlign: 'right' }}>GST</th>
                  <th>Invoice</th>
                  <th>Reason</th>
                  <th></th>
                </tr>
              )}
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="dp-row" style={{ cursor: 'pointer' }} onClick={() => (view === 'payments' ? setModal(p) : setRefundModal(p))}>
                  <td>{view === 'payments' ? p.payment_date : p.refund_date}</td>
                  <td style={{ fontWeight: 500 }}>{view === 'payments' ? p.receipt_number : p.refund_number}</td>
                  <td>{customerMap[p.customer_id]?.name || ''}</td>
                  <td>{p.method}</td>
                  <td style={{ textAlign: 'right', color: view === 'refunds' ? '#4B3A86' : undefined }}>{view === 'refunds' ? '-' : ''}{money(p.amount)}</td>
                  {view === 'refunds' && <td style={{ textAlign: 'right', color: '#5B5F56' }}>{money(p.gst_amount)}</td>}
                  <td>{p.invoices?.invoice_number || ''}</td>
                  <td style={{ color: '#5B5F56' }}>{view === 'payments' ? p.reference : p.reason}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="dp-btn" style={{ padding: 5 }} aria-label="Email" title={view === 'payments' ? 'Email receipt' : 'Email refund confirmation'} onClick={() => emailIt(p)}><Mail size={13} /></button>
                      <button className="dp-btn dp-btn-danger" style={{ padding: 5 }} aria-label="Delete" onClick={() => setConfirmDel(p)}><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ padding: '10px 12px', fontSize: 13, color: '#5B5F56', borderTop: '1px solid #EDEAE0', display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          <span>{filtered.length} {view} · Total <b style={{ color: '#20241F' }}>{money(total)}</b></span>
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
            say(`Payment saved — receipt #${p.receipt_number}.`);
            load();
          }}
        />
      )}
      {refundModal && (
        <RefundModal
          customers={customers}
          initial={refundModal.id ? refundModal : null}
          onClose={() => setRefundModal(null)}
          onSaved={(r) => {
            setRefundModal(null);
            setView('refunds');
            say(`Refund #${r.refund_number} saved (${money(r.amount)}).`);
            load();
          }}
        />
      )}
      {confirmDel && (
        <ConfirmDialog
          message={
            view === 'payments'
              ? `Delete receipt #${confirmDel.receipt_number} (${money(confirmDel.amount)})? The invoice will show as unpaid again.`
              : `Delete refund #${confirmDel.refund_number} (${money(confirmDel.amount)})? Only do this if the money wasn't actually paid back.`
          }
          onCancel={() => setConfirmDel(null)}
          onConfirm={() => del(confirmDel)}
        />
      )}
    </>
  );
}
