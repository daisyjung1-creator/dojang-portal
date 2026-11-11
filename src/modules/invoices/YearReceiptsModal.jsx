import React, { useEffect, useMemo, useState } from 'react';
import { Printer, Mail } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import Modal from '../../components/Modal';
import { money } from '../../lib/invoiceUtils';
import { loadSettings } from './api';
import { loadYearReceipts, yearReceiptHtml, receiptsDocument, yearReceiptText, printHtml } from '../../lib/yearReceipt';
import { confirmSend } from '../../components/ConfirmSend';

// Year-end receipts of fees paid (for taxes / benefits). One family, or every
// family that paid something that year — print them or email them all.
export default function YearReceiptsModal({ customers, student = null, onClose }) {
  const now = new Date();
  const [year, setYear] = useState(now.getMonth() <= 3 ? now.getFullYear() - 1 : now.getFullYear());
  const [settings, setSettings] = useState({});
  const [data, setData] = useState(null);
  const [sel, setSel] = useState({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const single = customers.length === 1;

  useEffect(() => {
    loadSettings().then((s) => setSettings(s || {}));
  }, []);

  useEffect(() => {
    setData(null);
    loadYearReceipts(customers, year, student?.id || null).then((r) => {
      setData(r);
      setSel(Object.fromEntries(Object.values(r).filter((x) => x.paid > 0.004 && x.customer.email).map((x) => [x.customer.id, true])));
    });
  }, [year, customers.length, student?.id]);

  const list = useMemo(() => (data ? Object.values(data).filter((r) => single || r.paid > 0.004).sort((a, b) => a.customer.name.localeCompare(b.customer.name)) : []), [data]);
  const chosen = list.filter((r) => (single ? true : sel[r.customer.id]));
  const title = `${year} receipts of fees paid`;

  function print() {
    const rs = single ? list : chosen;
    if (!printHtml(receiptsDocument(rs.map((r, i) => yearReceiptHtml(r, settings, { pageBreak: i < rs.length - 1 })), title))) setMsg('Pop-up blocked — allow pop-ups to print.');
  }

  async function email() {
    const rs = (single ? list : chosen).filter((r) => r.customer.email && r.paid > 0.004);
    if (!rs.length) return setMsg('Nobody to email (no email address or nothing paid).');
    if (!(await confirmSend({ what: `${year} receipt of fees paid`, to: rs.length === 1 ? rs[0].customer.email : `${rs.length} families`, note: 'Each family gets its own email with the receipt PDF attached.' }))) return;
    setBusy(true);
    const items = rs.map((r) => ({
      to: r.customer.email,
      student_id: student?.id || null,
      subject: `${year} receipt of taekwondo fees — ${student ? student.name : r.customer.name}`,
      message: yearReceiptText(r, settings),
      receipt: { year: r.year, customer: { name: student ? `${r.customer.name} (${student.name})` : r.customer.name }, children: r.children, paid: r.paid, gst: r.gst, payments: r.payments },
    }));
    // A few at a time, so a long list never times out.
    let sent = 0;
    const failed = [];
    for (let i = 0; i < items.length; i += 8) {
      setMsg(`Sending… ${sent} of ${items.length}`);
      const { data, error } = await supabase.functions.invoke('year-receipts', { body: { receipts: items.slice(i, i + 8) } });
      if (error || data?.error) {
        let m = data?.error || error.message;
        try {
          m = (await error?.context?.json())?.error || m;
        } catch (_e) {
          /* keep */
        }
        failed.push(m);
        break;
      }
      sent += data.sent || 0;
      failed.push(...(data.failed || []));
    }
    setBusy(false);
    setMsg(`Emailed ${sent} receipt${sent === 1 ? '' : 's'} with the PDF attached.${failed.length ? ` Not sent: ${failed.join('; ')}` : ''}`);
  }

  const years = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

  return (
    <Modal
      title={single ? `${year} receipt — ${student ? student.name : customers[0].name}` : 'Year-end receipts'}
      maxWidth={single ? 720 : 760}
      onClose={onClose}
      footer={
        <>
          <button className="dp-btn" onClick={onClose}>Close</button>
          <button className="dp-btn" disabled={!data || (!single && !chosen.length)} onClick={print}><Printer size={14} /> Print / PDF{!single && chosen.length ? ` (${chosen.length})` : ''}</button>
          <button className="dp-btn dp-btn-primary" disabled={!data || busy || (!single && !chosen.length)} onClick={email}><Mail size={14} /> Email{!single && chosen.length ? ` ${chosen.filter((r) => r.customer.email).length}` : ''}</button>
        </>
      }
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: '#5B5F56' }}>Year</span>
        {years.map((y) => (
          <button key={y} type="button" className="dp-btn" style={{ padding: '4px 12px', fontSize: 13, ...(y === year ? { background: '#20241F', color: '#fff', borderColor: '#20241F' } : {}) }} onClick={() => setYear(y)}>{y}</button>
        ))}
        <span style={{ fontSize: 12, color: '#8A8D84' }}>Jan 1 – Dec 31 · money actually paid (minus refunds), GST included</span>
      </div>
      {!data ? (
        <p style={{ fontSize: 13, color: '#5B5F56' }}>Loading…</p>
      ) : single ? (
        <div style={{ border: '1px solid #EDEAE0', borderRadius: 8, padding: '6px 20px', maxHeight: 460, overflow: 'auto' }} dangerouslySetInnerHTML={{ __html: `<style>.yr h1{font-size:22px;margin:18px 0 4px}.yr .m{color:#737373;font-size:12px;line-height:1.5}.yr table{width:100%;border-collapse:collapse;margin-top:14px}.yr th{text-align:left;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#999;border-bottom:1px solid #111;padding:6px 4px}.yr td{padding:7px 4px;border-bottom:1px solid #e0e0e0;font-size:13px}.yr .n{text-align:right}.yr .d{color:#737373;font-size:11.5px}.yr .t td{font-weight:700;border-bottom:none}.yr .bar{width:28px;height:4px;background:#BF1C21;margin-top:18px}.yr img{max-height:44px}</style><div class="yr">${yearReceiptHtml(list[0], settings)}</div>` }} />
      ) : list.length === 0 ? (
        <p style={{ fontSize: 13, color: '#5B5F56' }}>No family paid anything in {year}.</p>
      ) : (
        <div style={{ maxHeight: 440, overflow: 'auto', border: '1px solid #EDEAE0', borderRadius: 8 }}>
          <table className="dp-table">
            <thead>
              <tr>
                <th style={{ width: 30 }}><input type="checkbox" checked={chosen.length === list.length} onChange={(e) => setSel(Object.fromEntries(list.map((r) => [r.customer.id, e.target.checked])))} /></th>
                <th>Family</th><th>Children</th><th>Email</th><th style={{ textAlign: 'right' }}>Paid in {year}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.customer.id}>
                  <td><input type="checkbox" checked={!!sel[r.customer.id]} onChange={(e) => setSel({ ...sel, [r.customer.id]: e.target.checked })} /></td>
                  <td style={{ fontWeight: 500 }}>{r.customer.name}</td>
                  <td style={{ fontSize: 12.5, color: '#5B5F56' }}>{r.children.filter((k) => k.id !== '_family').map((k) => k.name.split(' ')[0]).join(', ')}</td>
                  <td style={{ fontSize: 12.5 }}>{r.customer.email || <span style={{ color: '#9A2B2B' }}>no email</span>}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{money(r.paid)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {msg && <p style={{ fontSize: 13, color: /^(Emailed|Sending)/.test(msg) && !msg.includes('Not sent') ? '#2A5A30' : '#9A2B2B', margin: '8px 0 0' }}>{msg}</p>}
    </Modal>
  );
}
