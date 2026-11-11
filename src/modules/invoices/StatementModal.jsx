import React, { useEffect, useState } from 'react';
import { Printer, Mail } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import Modal from '../../components/Modal';
import Field from '../../components/Field';
import { money, formatDate, localISO } from '../../lib/invoiceUtils';
import { loadSettings } from './api';
import { confirmSend } from '../../components/ConfirmSend';

// Account statement for a family (optionally one child) between two dates:
// every invoice and payment, with totals — print it or email it.

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export default function StatementModal({ customer, student = null, onClose }) {
  const today = localISO();
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [to, setTo] = useState(today);
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [to_, setTo_] = useState(customer?.email || student?.guardian_email || '');

  useEffect(() => {
    loadSettings().then((s) => setSettings(s || {}));
  }, []);

  useEffect(() => {
    if (!customer?.id) return;
    (async () => {
      const [{ data: invs }, { data: pays }, { data: refs }, { data: bal }] = await Promise.all([
        supabase.from('invoice_summary').select('id, invoice_number, invoice_date, total, balance, status, voided').eq('customer_id', customer.id).eq('voided', false).gte('invoice_date', from).lte('invoice_date', to).order('invoice_date'),
        supabase.from('invoice_payments').select('id, invoice_id, payment_date, method, amount, receipt_number, credit_amount').eq('customer_id', customer.id).gte('payment_date', from).lte('payment_date', to).order('payment_date'),
        supabase.from('invoice_refunds').select('id, invoice_id, refund_date, method, amount, refund_number').eq('customer_id', customer.id).gte('refund_date', from).lte('refund_date', to).order('refund_date'),
        supabase.from('customer_balances').select('balance').eq('customer_id', customer.id).maybeSingle(),
      ]);
      const ids = (invs || []).map((i) => i.id);
      const { data: lines } = ids.length ? await supabase.from('invoice_lines').select('invoice_id, student_id, description, amount').in('invoice_id', ids).order('position') : { data: [] };
      const linesBy = {};
      (lines || []).forEach((l) => (linesBy[l.invoice_id] ||= []).push(l));
      // One child only: their invoices (and the payments on them).
      let inv = invs || [];
      if (student) inv = inv.filter((i) => (linesBy[i.id] || []).some((l) => l.student_id === student.id));
      const keep = new Set(inv.map((i) => i.id));
      const p = (pays || []).filter((x) => !student || keep.has(x.invoice_id));
      const r = (refs || []).filter((x) => !student || keep.has(x.invoice_id));
      const invNo = Object.fromEntries((invs || []).map((i) => [i.id, i.invoice_number]));
      const rows = [
        ...inv.map((i) => ({
          date: i.invoice_date,
          what: `Invoice #${i.invoice_number}`,
          detail: (linesBy[i.id] || []).filter((l) => !student || !l.student_id || l.student_id === student.id).map((l) => `${l.description} (${money(l.amount)})`).join('; '),
          charge: Number(i.total),
          status: i.status,
        })),
        ...p.map((x) => ({ date: x.payment_date, what: `Payment — receipt #${x.receipt_number}`, detail: `${x.method}${x.invoice_id ? ` · for invoice #${invNo[x.invoice_id] ?? ''}` : ''}`, paid: Number(x.amount) })),
        // A refund takes money back off both sides (credited and paid back).
        ...r.map((x) => ({ date: x.refund_date, what: `Refund #${x.refund_number} — paid back ${money(x.amount)}`, detail: `${x.method}${x.invoice_id ? ` · invoice #${invNo[x.invoice_id] ?? ''}` : ''}`, charge: -Number(x.amount), paid: -Number(x.amount) })),
      ].sort((a, b) => (a.date === b.date ? (a.charge ? -1 : 1) : a.date < b.date ? -1 : 1));
      setData({ rows, charges: rows.reduce((n, x) => n + (x.charge || 0), 0), paid: rows.reduce((n, x) => n + (x.paid || 0), 0), balance: Number(bal?.balance || 0) });
    })();
  }, [customer?.id, student?.id, from, to]);

  const title = `Statement — ${student ? student.name : customer?.name || ''}`;
  const period = `${formatDate(from)} – ${formatDate(to)}`;

  function html() {
    const s = settings;
    const rows = data.rows
      .map((r) => `<tr><td>${esc(formatDate(r.date))}</td><td><b>${esc(r.what)}</b><div class="d">${esc(r.detail)}</div></td><td class="n">${r.charge > 0 ? esc(money(r.charge)) : ''}</td><td class="n">${r.paid > 0 ? esc(money(r.paid)) : ''}</td></tr>`)
      .join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
      body{font-family:Helvetica,Arial,sans-serif;color:#111;margin:40px;font-size:13px}
      h1{font-size:26px;margin:28px 0 4px} .m{color:#737373;font-size:12px;line-height:1.5}
      table{width:100%;border-collapse:collapse;margin-top:18px} th{text-align:left;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#999;border-bottom:1px solid #111;padding:6px 4px}
      td{padding:8px 4px;border-bottom:1px solid #e0e0e0;vertical-align:top} .n{text-align:right;white-space:nowrap} .d{color:#737373;font-size:11.5px;margin-top:2px}
      .t td{border:none;font-weight:700} .bar{width:28px;height:4px;background:#BF1C21;margin-top:24px}
    </style></head><body>
      <div style="display:flex;justify-content:space-between;align-items:flex-start"><div class="m"><b style="color:#111;font-size:13px">${esc(s.business_name || '')}</b><br>${esc([s.address, s.phone, s.email].filter(Boolean).join(' · '))}</div>${s.logo_data ? `<img src="${s.logo_data}" style="max-height:56px">` : ''}</div>
      <div class="bar"></div><h1>Statement</h1>
      <div class="m">${esc(customer?.name || '')}${student ? ` — ${esc(student.name)}` : ''}<br>${esc(period)} · issued ${esc(formatDate(today))}</div>
      <table><thead><tr><th>Date</th><th>Details</th><th class="n">Charges</th><th class="n">Payments</th></tr></thead><tbody>${rows || '<tr><td colspan="4">No activity in this period.</td></tr>'}
      <tr class="t"><td></td><td>Totals for this period</td><td class="n">${esc(money(data.charges))}</td><td class="n">${esc(money(data.paid))}</td></tr>
      <tr class="t"><td></td><td>Balance owing today (whole account)</td><td class="n" colspan="2">${esc(money(data.balance))}</td></tr></tbody></table>
    </body></html>`;
  }

  function print() {
    const w = window.open('', '_blank');
    if (!w) return setMsg('Pop-up blocked — allow pop-ups to print.');
    w.document.write(html());
    w.document.close();
    setTimeout(() => w.print(), 300);
  }

  function text() {
    const lines = data.rows.map((r) => `${formatDate(r.date)}  ${r.what}${r.charge > 0 ? `  ${money(r.charge)}` : ''}${r.paid > 0 ? `  paid ${money(r.paid)}` : ''}\n   ${r.detail}`);
    const first = (customer?.name || '').split(' ')[0];
    return [
      `Hello ${student?.guardian_name || first || ''},`,
      '',
      `Here is your account statement${student ? ` for ${student.name.split(' ')[0]}` : ''} for ${period}.`,
      '',
      ...(lines.length ? lines : ['No activity in this period.']),
      '',
      `Charges in this period: ${money(data.charges)}`,
      `Payments in this period: ${money(data.paid)}`,
      `Balance owing today: ${money(data.balance)}`,
      '',
      'Please let us know if you have any questions.',
      '',
      'Best Regards,',
      'Master Daisy',
    ].join('\n');
  }

  async function email() {
    const addr = to_.trim();
    if (!addr) return setMsg('No email address.');
    if (!(await confirmSend({ what: title, to: addr, note: `Statement for ${period}.` }))) return;
    setBusy(true);
    const { error } = await supabase.from('email_queue').insert({ type: 'broadcast', recipient_email: addr, student_id: student?.id || null, payload: { subject: `${title} (${period})`, message: text() } });
    setBusy(false);
    setMsg(error ? error.message : `Emailed to ${addr}.`);
  }

  return (
    <Modal
      title={title}
      maxWidth={760}
      onClose={onClose}
      footer={
        <>
          <button className="dp-btn" onClick={onClose}>Close</button>
          <button className="dp-btn" disabled={!data} onClick={print}><Printer size={14} /> Print / PDF</button>
          <button className="dp-btn dp-btn-primary" disabled={!data || busy || !to_.trim()} onClick={email}><Mail size={14} /> Email</button>
        </>
      }
    >
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="From"><input type="date" className="dp-input" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input type="date" className="dp-input" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <div style={{ display: 'flex', gap: 5, marginBottom: 12 }}>
          {[['This year', `${today.slice(0, 4)}-01-01`, today], ['Last year', `${Number(today.slice(0, 4)) - 1}-01-01`, `${Number(today.slice(0, 4)) - 1}-12-31`]].map(([l, a, b]) => (
            <button key={l} type="button" className="dp-btn" style={{ padding: '4px 9px', fontSize: 12 }} onClick={() => { setFrom(a); setTo(b); }}>{l}</button>
          ))}
        </div>
        <Field label="Email to"><input className="dp-input" style={{ width: 230 }} value={to_} onChange={(e) => setTo_(e.target.value)} /></Field>
      </div>
      {!customer?.id ? (
        <p style={{ fontSize: 13, color: '#9A2B2B' }}>This student isn't linked to a family account yet, so there are no invoices to show.</p>
      ) : !data ? (
        <p style={{ fontSize: 13, color: '#5B5F56' }}>Loading…</p>
      ) : (
        <>
          <div style={{ maxHeight: 360, overflow: 'auto', border: '1px solid #EDEAE0', borderRadius: 8 }}>
            <table className="dp-table">
              <thead><tr><th>Date</th><th>Details</th><th style={{ textAlign: 'right' }}>Charges</th><th style={{ textAlign: 'right' }}>Payments</th></tr></thead>
              <tbody>
                {data.rows.length === 0 && <tr><td colSpan={4} style={{ color: '#8A8D84', fontSize: 13 }}>No activity in this period.</td></tr>}
                {data.rows.map((r, i) => (
                  <tr key={i}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12.5 }}>{formatDate(r.date)}</td>
                    <td style={{ fontSize: 13 }}><b>{r.what}</b>{r.status && r.status !== 'Paid' && <span style={{ fontSize: 11, color: '#9A2B2B' }}> · {r.status}</span>}<div style={{ fontSize: 12, color: '#5B5F56' }}>{r.detail}</div></td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{r.charge > 0 ? money(r.charge) : ''}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap', color: '#2A5A30' }}>{r.paid > 0 ? money(r.paid) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 18, justifyContent: 'flex-end', fontSize: 13.5, marginTop: 10, flexWrap: 'wrap' }}>
            <span>Charges: <b>{money(data.charges)}</b></span>
            <span>Payments: <b style={{ color: '#2A5A30' }}>{money(data.paid)}</b></span>
            <span>Balance owing today: <b style={{ color: data.balance > 0.004 ? '#9A2B2B' : '#20241F' }}>{money(data.balance)}</b></span>
          </div>
        </>
      )}
      {msg && <p style={{ fontSize: 13, color: msg.startsWith('Emailed') ? '#2A5A30' : '#9A2B2B', margin: '8px 0 0' }}>{msg}</p>}
    </Modal>
  );
}
