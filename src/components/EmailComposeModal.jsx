import React, { useState } from 'react';
import { Mail } from 'lucide-react';
import { supabase } from '../supabaseClient';
import Modal from './Modal';
import Field from './Field';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const splitEmails = (v) => String(v || '').split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean);

// Review / edit an email, then put it in the send queue.
// draft = { title, type, to, subject, message, studentId, payload, note }
export default function EmailComposeModal({ draft, onClose, onSent }) {
  const [d, setD] = useState({ ...draft, error: '', sending: false });

  async function send() {
    const emails = splitEmails(d.to);
    if (!emails.length || emails.some((e) => !EMAIL_RE.test(e))) return setD({ ...d, error: 'Enter a valid email address.' });
    if (!d.message.trim()) return setD({ ...d, error: 'The message is empty.' });
    setD({ ...d, sending: true, error: '' });
    const { error } = await supabase.from('email_queue').insert({
      type: d.type,
      student_id: d.studentId || null,
      recipient_email: emails.join(', '),
      payload: { ...(d.payload || {}), subject: d.subject, message: d.message },
    });
    if (error) return setD({ ...d, sending: false, error: 'Could not send: ' + error.message });
    onSent && (await onSent(new Date().toISOString()));
  }

  return (
    <Modal
      title={d.title}
      maxWidth={620}
      onClose={onClose}
      footer={
        <>
          <button className="dp-btn" onClick={onClose}>Cancel</button>
          <button className="dp-btn dp-btn-primary" disabled={d.sending} onClick={send}><Mail size={15} /> Send</button>
        </>
      }
    >
      {d.note && <p style={{ fontSize: 12.5, color: '#854F0B', margin: '0 0 10px' }}>{d.note}</p>}
      <Field label="To (comma-separated)"><input className="dp-input" style={{ width: '100%' }} value={d.to} onChange={(e) => setD({ ...d, to: e.target.value })} /></Field>
      <Field label="Subject"><input className="dp-input" style={{ width: '100%' }} value={d.subject} onChange={(e) => setD({ ...d, subject: e.target.value })} /></Field>
      <Field label="Message (you can edit it before sending)">
        <textarea className="dp-input" rows={12} style={{ width: '100%', resize: 'vertical', fontSize: 13, lineHeight: 1.5 }} value={d.message} onChange={(e) => setD({ ...d, message: e.target.value })} />
      </Field>
      {d.error && <p style={{ color: '#9A2B2B', fontSize: 13, margin: 0 }}>{d.error}</p>}
    </Modal>
  );
}
