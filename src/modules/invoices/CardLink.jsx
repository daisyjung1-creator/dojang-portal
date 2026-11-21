import React, { useState } from 'react';
import { CreditCard } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import Modal from '../../components/Modal';
import { queueEmail } from './api';

// "Save your card" link for families moving from TD Recurring Billing to a
// saved card: /card/<card_link_token>. Nothing is charged on that page.
export const cardLink = (c) => (c?.card_link_token ? `https://dojang-portal.netlify.app/card/${c.card_link_token}` : '');

const BULLETS = [
  'No payment is taken when you save your card.',
  'Tuition is charged automatically on each billing date, and a receipt is emailed to you after every payment.',
  'The page shows your next tuition amount and billing date, so you can review them before saving.',
  'Only credit cards can be accepted (debit cards, including Visa Debit and Debit Mastercard, are not supported).',
  "Your card details are entered directly into TD Online Mart's secure payment system and are never stored by the Dojang.",
];
const SIGN = 'If you have any questions, please reply to this email or call us at 780-450-0181.\n\nKind regards,\nMaster Daisy\nChampion Hankook Taekwondo';

// kind: 'new' (just registered), 'existing' (moving from the old payment system)
// or 'change' (has a saved card and wants to use a different one).
function cardEmail(c, kind) {
  const notes = BULLETS.map((b) => `• ${b}`).join('\n');
  if (kind === 'change')
    return {
      subject: 'Update your tuition payment card — Champion Hankook Taekwondo',
      message: `Dear ${c.name},\n\nAs requested, here is a secure link to change the credit card used for your tuition payments:\n\n${cardLink(c)}\n\nOnce you save the new card, it replaces the card ending ${c.card_last4 || '····'} and is used from your next billing date. Nothing is charged when you save it.\n\nPlease note:\n${notes}\n\n${SIGN}`,
    };
  if (kind === 'new')
    return {
      subject: 'Set up your tuition payment card — Champion Hankook Taekwondo',
      message: `Dear ${c.name},\n\nWelcome to Champion Hankook Taekwondo — we are delighted to have you with us.\n\nTo complete your registration, please register the credit card you would like to use for tuition through the secure link below:\n\n${cardLink(c)}\n\nPlease note:\n${notes}\n\nWe kindly ask that you complete this before your first billing date. ${SIGN}`,
    };
  return {
    subject: 'Action required: update your tuition payment card — Champion Hankook Taekwondo',
    message: `Dear ${c.name},\n\nThank you for being part of Champion Hankook Taekwondo.\n\nWe have moved our tuition payments to a new, secure online system. To keep your tuition payments running without interruption, please register the credit card you would like to use through the secure link below:\n\n${cardLink(c)}\n\nPlease note:\n${notes}\n\nWe kindly ask that you complete this before your next billing date. ${SIGN}`,
  };
}

export function CardLinkButton({ customer, onSent, style }) {
  const [open, setOpen] = useState(false);
  const [mail, setMail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  // New families (added in the last 45 days) get the welcome version.
  const hasCard = !!customer?.card_profile_code;
  const [kind, setKind] = useState(hasCard ? 'change' : customer?.created_at && Date.now() - new Date(customer.created_at).getTime() < 45 * 864e5 ? 'new' : 'existing');
  if (!customer?.card_link_token) return null;
  const link = cardLink(customer);
  function show() {
    setMail(cardEmail(customer, kind));
    setMsg('');
    setOpen(true);
  }
  async function send() {
    if (!customer.email) return setMsg('This family has no email address — copy the link and text it instead.');
    setBusy(true);
    try {
      await queueEmail('welcome', customer.email, { subject: mail.subject, message: mail.message });
      const at = new Date().toISOString();
      await supabase.from('customers').update({ card_link_sent_at: at }).eq('id', customer.id);
      onSent && onSent(at);
      setOpen(false);
    } catch (e) {
      setMsg('Could not send: ' + e.message);
    }
    setBusy(false);
  }
  return (
    <>
      <button type="button" className="dp-btn" style={{ padding: '1px 8px', fontSize: 11.5, ...style }} onClick={show} title={hasCard ? 'Send the family a link to replace their saved card' : 'Send the family a link to save their card for automatic tuition'}>
        <CreditCard size={12} /> {hasCard ? 'Change card' : `Card link${customer.card_link_sent_at ? ' (sent)' : ''}`}
      </button>
      {open && (
        <Modal
          title={`Card link — ${customer.name}`}
          maxWidth={640}
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="dp-btn" onClick={() => setOpen(false)}>Cancel</button>
              <button className="dp-btn dp-btn-primary" disabled={busy} onClick={send}>{busy ? 'Sending…' : 'Send email'}</button>
            </>
          }
        >
          <p style={{ fontSize: 12.5, color: '#5B5F56', margin: '0 0 8px' }}>
            {hasCard
              ? `The family enters the new card on a secure page (nothing is charged). It replaces the saved card ending ${customer.card_last4 || '····'}, the old card is deleted from TD Online Mart, and you get an email when it's done.`
              : 'The family enters their card on a secure page (nothing is charged). Their next tuition amount and date are shown there, so check the family\'s tuition is right before sending. After they save it, close their old Recurring Billing account in TD Online Mart and tick "Old TD Recurring Billing is closed" on the family — automatic charges only start then.'}
          </p>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <input className="dp-input" readOnly value={link} style={{ flex: 1, fontSize: 12 }} onFocus={(e) => e.target.select()} />
            <button className="dp-btn" onClick={() => navigator.clipboard?.writeText(link).then(() => setMsg('Link copied.'))}>Copy link</button>
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {(hasCard ? [['change', 'Change card']] : [['new', 'New family'], ['existing', 'Existing family (moving from old system)']]).map(([k, l]) => (
              <button key={k} className="dp-btn" style={{ fontSize: 12, background: kind === k ? '#20241F' : '#fff', color: kind === k ? '#fff' : '#20241F' }} onClick={() => { setKind(k); setMail(cardEmail(customer, k)); }}>{l}</button>
            ))}
          </div>
          <label style={{ fontSize: 12, color: '#5B5F56' }}>Subject</label>
          <input className="dp-input" style={{ width: '100%', marginBottom: 10 }} value={mail.subject} onChange={(e) => setMail({ ...mail, subject: e.target.value })} />
          <label style={{ fontSize: 12, color: '#5B5F56' }}>Message to {customer.email || '(no email)'}</label>
          <textarea className="dp-input" style={{ width: '100%', minHeight: 280, fontFamily: 'inherit', fontSize: 13.5, lineHeight: 1.5 }} value={mail.message} onChange={(e) => setMail({ ...mail, message: e.target.value })} />
          {msg && <p style={{ fontSize: 12.5, color: msg.startsWith('Link') ? '#2A5A30' : '#9A2B2B', margin: '6px 0 0' }}>{msg}</p>}
        </Modal>
      )}
    </>
  );
}
