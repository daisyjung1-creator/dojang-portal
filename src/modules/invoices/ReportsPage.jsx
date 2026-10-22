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
  const [owing, setOwing] = useState([]);
  const [selMonth, setSelMonth] = useState(new Date().getMonth());

  useEffect(() => {
    (async () => {
      const [{ data: s }, { data: p }] = await Promise.all([
        supabase.from('monthly_sales').select('*').like('month', `${year}-%`),
        supabase.from('monthly_payments').select('*').like('month', `${year}-%`),
      ]);
      setSales(s || []);
      setPays(p || []);
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
        const received = pays.filter((x) => x.month === key).reduce((t, x) => t + Number(x.amount), 0);
        return { label, key, count: Number(s.invoice_count || 0), subtotal: Number(s.subtotal || 0), gst: Number(s.gst || 0), total: Number(s.total || 0), unpaid: Number(s.unpaid || 0), received };
      }),
    [sales, pays, year]
  );
  const sum = (k, list = rows) => list.reduce((t, r) => t + r[k], 0);
  const quarters = [0, 1, 2, 3].map((q) => {
    const part = rows.slice(q * 3, q * 3 + 3);
    return { label: `Q${q + 1} (${MONTHS[q * 3]}–${MONTHS[q * 3 + 2]})`, subtotal: sum('subtotal', part), gst: sum('gst', part), total: sum('total', part) };
  });
  const maxTotal = Math.max(1, ...rows.map((r) => r.total));
  const sel = rows[selMonth];
  const selMethods = pays.filter((p) => p.month === sel.key).sort((a, b) => b.amount - a.amount);
  const totalOwing = owing.reduce((t, r) => t + Number(r.balance), 0);

  function exportCSV() {
    downloadCSV(`sales_${year}.csv`, [
      ['Month', 'Invoices', 'Sales (before GST)', 'GST', 'Total Invoiced', 'Payments Received', 'Still Unpaid'],
      ...rows.map((r) => [r.key, r.count, r.subtotal.toFixed(2), r.gst.toFixed(2), r.total.toFixed(2), r.received.toFixed(2), r.unpaid.toFixed(2)]),
      ['Total', sum('count'), sum('subtotal').toFixed(2), sum('gst').toFixed(2), sum('total').toFixed(2), sum('received').toFixed(2), sum('unpaid').toFixed(2)],
    ]);
  }

  const num = { textAlign: 'right' };
  return (
    <>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Sales & GST</h1>
          <p style={styles.subtitle}>Monthly sales, GST collected and money received (voided invoices excluded)</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select className="dp-select" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[thisYear + 1, thisYear, thisYear - 1, thisYear - 2, thisYear - 3].map((y) => <option key={y}>{y}</option>)}
          </select>
          <button className="dp-btn" onClick={exportCSV}><Download size={15} /> Export</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 18 }}>
        <div style={styles.metricCard}><p style={styles.metricLabel}>{MONTHS[selMonth]} sales (before GST)</p><p style={styles.metricValue}>{money(sel.subtotal)}</p></div>
        <div style={styles.metricCard}><p style={styles.metricLabel}>{MONTHS[selMonth]} GST collected</p><p style={styles.metricValue}>{money(sel.gst)}</p></div>
        <div style={styles.metricCard}><p style={styles.metricLabel}>{MONTHS[selMonth]} received</p><p style={styles.metricValue}>{money(sel.received)}</p></div>
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
              <tr><th>Month</th><th style={num}>Invoices</th><th style={num}>Sales</th><th style={num}>GST</th><th style={num}>Total</th><th style={num}>Received</th><th style={num}>Unpaid</th></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.key} className="dp-row" style={{ cursor: 'pointer', background: i === selMonth ? '#FAF3F3' : undefined }} onClick={() => setSelMonth(i)}>
                  <td style={{ fontWeight: 500 }}>{r.label}</td>
                  <td style={num}>{r.count || ''}</td>
                  <td style={num}>{r.subtotal ? money(r.subtotal) : ''}</td>
                  <td style={num}>{r.gst ? money(r.gst) : ''}</td>
                  <td style={num}>{r.total ? money(r.total) : ''}</td>
                  <td style={num}>{r.received ? money(r.received) : ''}</td>
                  <td style={{ ...num, color: r.unpaid ? '#9A2B2B' : undefined }}>{r.unpaid ? money(r.unpaid) : ''}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 600 }}>
                <td>Total</td>
                <td style={num}>{sum('count')}</td>
                <td style={num}>{money(sum('subtotal'))}</td>
                <td style={num}>{money(sum('gst'))}</td>
                <td style={num}>{money(sum('total'))}</td>
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
                  <tr key={q.label}><td>{q.label}</td><td style={num}>{money(q.gst)}</td></tr>
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
