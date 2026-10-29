import React, { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import { money, downloadCSV } from '../../lib/invoiceUtils';
import { fetchAll } from './api';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function ReportsPage() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [sales, setSales] = useState([]);
  const [pays, setPays] = useState([]);
  const [refs, setRefs] = useState([]);
  const [owing, setOwing] = useState([]);
  const [selMonth, setSelMonth] = useState(new Date().getMonth());

  useEffect(() => {
    (async () => {
      const [{ data: s }, { data: p }, { data: r }] = await Promise.all([
        supabase.from('monthly_sales').select('*').like('month', `${year}-%`),
        supabase.from('monthly_payments').select('*').like('month', `${year}-%`),
        supabase.from('monthly_refunds').select('*').like('month', `${year}-%`),
      ]);
      setSales(s || []);
      setPays(p || []);
      setRefs(r || []);
    })();
  }, [year]);

  useEffect(() => {
    (async () => {
      const [{ data: b }, { data: c }] = await Promise.all([
        fetchAll(() => supabase.from('customer_balances').select('*').gt('balance', 0)),
        fetchAll(() => supabase.from('customers').select('id, name, email, phone')),
      ]);
      const cm = Object.fromEntries((c || []).map((x) => [x.id, x]));
      setOwing((b || []).map((r) => ({ ...r, customer: cm[r.customer_id] })).sort((a, b2) => b2.balance - a.balance));
    })();
  }, []);

  const rows = useMemo(
    () =>
      MONTHS.map((label, i) => {
        const key = `${year}-${String(i + 1).padStart(2, '0')}`;
        const s = sales.find((x) => x.month === key) || {};
        const rf = refs.find((x) => x.month === key) || {};
        const paidIn = pays.filter((x) => x.month === key).reduce((t, x) => t + Number(x.amount), 0);
        const subtotal = Number(s.subtotal || 0);
        const grossGst = Number(s.gst || 0);
        const refundSales = Number(rf.sales_refund || 0);
        const refundGst = Number(rf.gst_refund || 0);
        const refunded = Number(rf.refunded || 0);
        return {
          label, key,
          count: Number(s.invoice_count || 0),
          subtotal, refundSales, netSales: subtotal - refundSales,
          grossGst, refundGst, gst: grossGst - refundGst,          // gst = net GST collected
          total: Number(s.total || 0), unpaid: Number(s.unpaid || 0),
          paidIn, refunded, received: paidIn - refunded,           // received = net of refunds
        };
      }),
    [sales, pays, refs, year]
  );
  const sum = (k, list = rows) => list.reduce((t, r) => t + r[k], 0);
  const quarters = [0, 1, 2, 3].map((q) => {
    const part = rows.slice(q * 3, q * 3 + 3);
    return { label: `Q${q + 1} (${MONTHS[q * 3]}–${MONTHS[q * 3 + 2]})`, grossGst: sum('grossGst', part), refundGst: sum('refundGst', part), gst: sum('gst', part) };
  });
  const maxTotal = Math.max(1, ...rows.map((r) => r.total));
  const sel = rows[selMonth];
  const selMethods = pays.filter((p) => p.month === sel.key).sort((a, b) => b.amount - a.amount);
  const totalOwing = owing.reduce((t, r) => t + Number(r.balance), 0);

  function exportCSV() {
    downloadCSV(`sales_${year}.csv`, [
      ['Month', 'Invoices', 'Sales (before GST)', 'Refunds (before GST)', 'Net sales', 'GST on invoices', 'GST refunded', 'Net GST', 'Total invoiced', 'Payments received', 'Refunds paid out', 'Net received', 'Still unpaid'],
      ...[...rows, { key: 'Total', ...Object.fromEntries(['count', 'subtotal', 'refundSales', 'netSales', 'grossGst', 'refundGst', 'gst', 'total', 'paidIn', 'refunded', 'received', 'unpaid'].map((k) => [k, sum(k)])) }].map((r) => [
        r.key, r.count, ...['subtotal', 'refundSales', 'netSales', 'grossGst', 'refundGst', 'gst', 'total', 'paidIn', 'refunded', 'received', 'unpaid'].map((k) => r[k].toFixed(2)),
      ]),
    ]);
  }

  const num = { textAlign: 'right' };
  return (
    <>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Sales & GST</h1>
          <p style={styles.subtitle}>Monthly sales, GST and money received, after refunds (voided invoices excluded)</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select className="dp-select" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[thisYear + 1, thisYear, thisYear - 1, thisYear - 2, thisYear - 3].map((y) => <option key={y}>{y}</option>)}
          </select>
          <button className="dp-btn" onClick={exportCSV}><Download size={15} /> Export</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 18 }}>
        <Metric label={`${MONTHS[selMonth]} net sales (before GST)`} value={money(sel.netSales)} note={sel.refundSales ? `${money(sel.subtotal)} sales − ${money(sel.refundSales)} refunds` : ''} />
        <Metric label={`${MONTHS[selMonth]} net GST collected`} value={money(sel.gst)} note={sel.refundGst ? `${money(sel.grossGst)} − ${money(sel.refundGst)} refunded` : ''} />
        <Metric label={`${MONTHS[selMonth]} received (net)`} value={money(sel.received)} note={sel.refunded ? `${money(sel.paidIn)} in − ${money(sel.refunded)} refunded` : ''} />
        <div style={styles.metricCard}><p style={styles.metricLabel}>Owing now (all customers)</p><p style={{ ...styles.metricValue, color: totalOwing > 0 ? '#9A2B2B' : '#20241F' }}>{money(totalOwing)}</p></div>
      </div>

      <div style={{ ...styles.card, padding: '16px 16px 8px', marginBottom: 18 }}>
        <p style={{ ...styles.metricLabel, marginBottom: 10 }}>Total invoiced by month, {year} — click a month for details</p>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 150 }}>
          {rows.map((r, i) => (
            <button key={r.key} onClick={() => setSelMonth(i)} title={`${r.label}: ${money(r.total)}`} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
              <span style={{ fontSize: 10.5, color: '#5B5F56', marginBottom: 3 }}>{r.total ? '$' + Math.round(r.total / 100) / 10 + 'k' : ''}</span>
              <span style={{ width: '100%', maxWidth: 40, height: `${(r.total / maxTotal) * 110}px`, minHeight: r.total ? 2 : 0, background: i === selMonth ? '#9A2B2B' : '#C9A9A9', borderRadius: '4px 4px 0 0' }} />
              <span style={{ fontSize: 11.5, marginTop: 4, color: i === selMonth ? '#20241F' : '#8A8D84', fontWeight: i === selMonth ? 600 : 400 }}>{r.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>
        <div style={styles.card}>
          <table className="dp-table">
            <thead>
              <tr><th>Month</th><th style={num}>Invoices</th><th style={num}>Sales</th><th style={num}>Refunds</th><th style={num}>Net sales</th><th style={num}>Net GST</th><th style={num}>Received</th><th style={num}>Unpaid</th></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.key} className="dp-row" style={{ cursor: 'pointer', background: i === selMonth ? '#FAF3F3' : undefined }} onClick={() => setSelMonth(i)}>
                  <td style={{ fontWeight: 500 }}>{r.label}</td>
                  <td style={num}>{r.count || ''}</td>
                  <td style={num}>{r.subtotal ? money(r.subtotal) : ''}</td>
                  <td style={{ ...num, color: '#4B3A86' }}>{r.refundSales ? '-' + money(r.refundSales) : ''}</td>
                  <td style={num}>{r.netSales ? money(r.netSales) : ''}</td>
                  <td style={num}>{r.gst ? money(r.gst) : ''}</td>
                  <td style={num}>{r.received ? money(r.received) : ''}</td>
                  <td style={{ ...num, color: r.unpaid ? '#9A2B2B' : undefined }}>{r.unpaid ? money(r.unpaid) : ''}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 600 }}>
                <td>Total</td>
                <td style={num}>{sum('count')}</td>
                <td style={num}>{money(sum('subtotal'))}</td>
                <td style={{ ...num, color: '#4B3A86' }}>{sum('refundSales') ? '-' + money(sum('refundSales')) : ''}</td>
                <td style={num}>{money(sum('netSales'))}</td>
                <td style={num}>{money(sum('gst'))}</td>
                <td style={num}>{money(sum('received'))}</td>
                <td style={num}>{money(sum('unpaid'))}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={styles.card}>
            <p style={{ ...styles.metricLabel, padding: '12px 12px 0' }}>GST by quarter (for your GST return)</p>
            <table className="dp-table">
              <tbody>
                {quarters.map((q) => (
                  <tr key={q.label}>
                    <td>
                      {q.label}
                      {q.refundGst > 0 && <div style={{ fontSize: 11.5, color: '#8A8D84' }}>{money(q.grossGst)} − {money(q.refundGst)} refunded</div>}
                    </td>
                    <td style={num}>{money(q.gst)}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 600 }}><td>{year} total</td><td style={num}>{money(sum('gst'))}</td></tr>
              </tbody>
            </table>
          </div>
          <div style={styles.card}>
            <p style={{ ...styles.metricLabel, padding: '12px 12px 0' }}>{MONTHS[selMonth]} {year} received by method</p>
            {selMethods.length === 0 ? (
              <p style={{ padding: '0 12px 12px', fontSize: 13, color: '#8A8D84' }}>No payments.</p>
            ) : (
              <table className="dp-table">
                <tbody>
                  {selMethods.map((m) => (
                    <tr key={m.method}><td>{m.method} <span style={{ color: '#8A8D84' }}>({m.payment_count})</span></td><td style={num}>{money(m.amount)}</td></tr>
                  ))}
                  {sel.refunded > 0 && <tr><td style={{ color: '#4B3A86' }}>Refunds paid out</td><td style={{ ...num, color: '#4B3A86' }}>-{money(sel.refunded)}</td></tr>}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <div style={{ ...styles.card, marginTop: 18 }}>
        <p style={{ ...styles.metricLabel, padding: '12px 12px 0' }}>Unpaid accounts</p>
        {owing.length === 0 ? (
          <p style={{ padding: '0 12px 12px', fontSize: 13, color: '#8A8D84' }}>Nobody owes anything.</p>
        ) : (
          <table className="dp-table">
            <thead><tr><th>Customer</th><th>Email</th><th>Phone</th><th>Last invoice</th><th style={num}>Owing</th></tr></thead>
            <tbody>
              {owing.map((r) => (
                <tr key={r.customer_id}>
                  <td style={{ fontWeight: 500 }}>{r.customer?.name}</td>
                  <td>{r.customer?.email}</td>
                  <td>{r.customer?.phone}</td>
                  <td>{r.last_invoice_date}</td>
                  <td style={{ ...num, color: '#9A2B2B' }}>{money(r.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function Metric({ label, value, note }) {
  return (
    <div style={styles.metricCard}>
      <p style={styles.metricLabel}>{label}</p>
      <p style={styles.metricValue}>{value}</p>
      {note && <p style={{ fontSize: 11.5, color: '#8A8D84', margin: '4px 0 0' }}>{note}</p>}
    </div>
  );
}
