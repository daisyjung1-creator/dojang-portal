import React, { useState } from 'react';
import { CreditCard } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import Modal from '../../components/Modal';
import { queueEmail } from './api';

// "Save your card" link for families moving from TD Recurring Billing to a
// saved card: /card/<card_link_token>. Nothing is charged on that page.
export const cardLink = (c) => (c?.card_link_token ? `https://dojang-portal.netlify.app/card/${c.card_link_token}` : '');

function cardEmail(c) {
  return {
    subject: 'Action needed: your card for tuition — Champion Hankook Taekwondo',
    message: `Hi ${c.name},\n\nWe're moving tuition payments to our new system. To keep your tuition payments going without interruption, please enter the credit card you'd like to use for tuition at this secure link:\n\n${cardLink(c)}\n\nNothing is charged when you save the card. From your next billing date, tuition is charged to it automatically and a receipt is emailed every time. The page shows your next tuition amount and date, so you can check it first.\n\nPlease note: credit cards only — debit cards (including Visa Debit and Debit Mastercard) can't be used.\n\nIf you have any questions, just reply to this email.\n\nThank you,\nMaster Daisy\nChampion Hankook Taekwondo`,
  };
}

export function CardLinkButton({ customer, onSent, style }) {
  const [open, setOpen] = useState(false);
  const [mail, setMail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  if (!customer?.card_link_token) return null;
  const link = cardLink(customer);
  function show() {
    setMail(cardEmail(customer));
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
      <button type="button" className="dp-btn" style={{ padding: '1px 8px', fontSize: 11.5, ...style }} onClick={show} title="Send the family a link to save their card for automatic tuition">
        <CreditCard size={12} /> Card link{customer.card_link_sent_at ? ' (sent)' : ''}
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
            The family enters their card on a secure page (nothing is charged). Their next tuition amount and date are shown there, so check the family's tuition is right before sending. After they save it, close their old Recurring Billing account in TD Online Mart and tick "Old TD Recurring Billing is closed" on the family — automatic charges only start then.
          </p>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <input className="dp-input" readOnly value={link} style={{ flex: 1, fontSize: 12 }} onFocus={(e) => e.target.select()} />
            <button className="dp-btn" onClick={() => navigator.clipboard?.writeText(link).then(() => setMsg('Link copied.'))}>Copy link</button>
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
