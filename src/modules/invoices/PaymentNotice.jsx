import React, { useState } from 'react';
import { supabase } from '../../supabaseClient';
import Modal from '../../components/Modal';
import { addDaysISO } from '../../lib/billingDates';
import { isManual } from '../../lib/tuitionBilling';
import { money, formatDate } from '../../lib/invoiceUtils';
import { queueEmail } from './api';

export const shortDate = (ts) => (ts ? new Date(ts).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', timeZone: 'America/Edmonton' }) : '');

// Used on Home (Overdue) and Billing (Unpaid).
// Overdue invoice: notice that classes may be suspended (agreement 7.3) unless paid.
// Manual payers are asked to pay; card families are told the automatic payment
// didn't go through and can pay with another card (and keep it for next time).
const NOTICE_DAYS = 7;
export function overdueEmail(inv, c, today) {
  const name = c?.name || inv.customer_name;
  const amount = money(inv.balance);
  const due = formatDate(inv.due_date || inv.invoice_date);
  const by = formatDate(addDaysISO(today, NOTICE_DAYS));
  const card = c && !isManual(c);
  const policy = `As outlined in Part 7.3 of our Membership Agreement, tuition must be paid in full by the payment date; if it is overdue, only partly paid or a payment is unsuccessful, class participation may be temporarily suspended after notice. Please consider this email that notice: if the balance is not paid by ${by}, your child's classes will be paused until the account is brought up to date.`;
  const sign = 'Thank you for your understanding,\nMaster Daisy\nChampion Hankook Taekwondo';
  if (card)
    return {
      subject: `Action needed: tuition payment unsuccessful — invoice #${inv.invoice_number}`,
      message: `Hi ${name},\n\nYour tuition payment of ${amount} (invoice #${inv.invoice_number}, due ${due}) could not be processed with your saved card${c.card_last4 ? ` ending in ${c.card_last4}` : ''}. This usually happens when a card has expired, been replaced, or reached its limit.\n\n${policy}\n\nYou can pay securely online with another card using the "Pay now" button below. When you pay, you can also choose to use the new card for future tuition, so your next tuition payment goes through automatically. You're also welcome to pay at the front desk.\n\nIf you've already taken care of this, thank you — please disregard this email. If you have any questions or need to talk about your account, just reply here.\n\n${sign}`,
    };
  return {
    subject: `Overdue tuition — invoice #${inv.invoice_number}`,
    message: `Hi ${name},\n\nOur records show that tuition of ${amount} (invoice #${inv.invoice_number}) was due on ${due} and is still outstanding.\n\n${policy}\n\nYou can pay securely online by credit card using the "Pay now" button below, or by cash, debit or e-Transfer at the front desk.\n\nIf you've already paid, thank you — please disregard this email. If you have any questions or need to talk about your account, just reply here.\n\n${sign}`,
  };
}

export default function PaymentNoticeModal({ inv, cust, sentAt, today, onClose, onSent }) {
  const [form, setForm] = useState(() => overdueEmail(inv, cust, today));
  const [to, setTo] = useState(cust?.email || '');
  const [extra, setExtra] = useState(''); // added for this email only — not saved to the family
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  async function send() {
    const list = [...new Set(`${to},${extra}`.split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
    const bad = list.filter((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (!list.length) return setMsg('Add an email address.');
    if (bad.length) return setMsg(`Check the email address: ${bad.join(', ')}`);
    setBusy(true);
    try {
      // Sent as the invoice email: PDF attached, "Pay now" button under the message.
      await queueEmail('invoice', list.join(', '), { invoice_id: inv.id, subject: form.subject, message: form.message });
      const at = new Date().toISOString();
      await supabase.from('invoices').update({ overdue_notice_at: at }).eq('id', inv.id);
      onSent(at);
    } catch (e) {
      setMsg('Could not send: ' + e.message);
      setBusy(false);
    }
  }
  return (
    <Modal title={`Overdue notice — ${inv.customer_name}`} maxWidth={640} onClose={onClose} footer={<><button className="dp-btn" onClick={onClose}>Cancel</button><button className="dp-btn dp-btn-primary" disabled={busy} onClick={send}>{busy ? 'Sending…' : 'Send email'}</button></>}>
      <p style={{ fontSize: 12.5, color: 'var(--dp-ink-soft)', margin: '0 0 10px' }}>
        {cust && !isManual(cust) ? 'Card family — automatic payment didn’t go through.' : 'Manual payer.'} Classes are paused if unpaid by {formatDate(addDaysISO(today, NOTICE_DAYS))} (agreement 7.3).
        {sentAt && <b style={{ fontWeight: 500, color: 'var(--dp-warning)', fontWeight: 500 }}> A notice was already sent {shortDate(sentAt)}.</b>}
      </p>
      <label style={{ fontSize: 12, color: 'var(--dp-ink-soft)' }}>To</label>
      <input className="dp-input" style={{ width: '100%', marginBottom: 10 }} value={to} onChange={(e) => setTo(e.target.value)} />
      <label style={{ fontSize: 12, color: 'var(--dp-ink-soft)' }}>Also send to <span style={{ color: 'var(--dp-ink-faint)' }}>— this email only, not saved to the family</span></label>
      <input className="dp-input" style={{ width: '100%', marginBottom: 10 }} placeholder="e.g. dad@example.com (separate several with commas)" value={extra} onChange={(e) => setExtra(e.target.value)} />
      <label style={{ fontSize: 12, color: 'var(--dp-ink-soft)' }}>Subject</label>
      <input className="dp-input" style={{ width: '100%', marginBottom: 10 }} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
      <label style={{ fontSize: 12, color: 'var(--dp-ink-soft)' }}>Message</label>
      <textarea className="dp-input" style={{ width: '100%', minHeight: 320, fontFamily: 'inherit', fontSize: 13.5, lineHeight: 1.5 }} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
      <p style={{ fontSize: 12, color: 'var(--dp-ink-faint)', margin: '8px 0 0' }}>The invoice PDF is attached and a "Pay now by credit card" button is added under the message.</p>
      {msg && <p style={{ fontSize: 12.5, color: 'var(--dp-danger)' }}>{msg}</p>}
    </Modal>
  );
}

