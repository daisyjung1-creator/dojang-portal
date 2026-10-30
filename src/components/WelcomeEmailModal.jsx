import React, { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { supabase } from '../supabaseClient';
import Modal from './Modal';
import Field from './Field';
import { fillWelcomeTemplate } from '../lib/welcomeEmail';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const splitEmails = (v) => String(v || '').split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean);

// Preview, edit and send the welcome email for one student.
export default function WelcomeEmailModal({ student, onClose, onSent }) {
  const [state, setState] = useState(null);

  useEffect(() => {
    supabase
      .from('invoice_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data: st }) => {
        const s = st || {};
        setState({
          to: student.guardian_email || '',
          subject: fillWelcomeTemplate(s.welcome_subject || 'Welcome to {business}, {student}!', student, s),
          message: fillWelcomeTemplate(s.welcome_message || '', student, s),
          error: '',
          sending: false,
        });
      });
  }, [student.id]);

  if (!state) return null;

  async function send() {
    const emails = splitEmails(state.to);
    if (!emails.length || emails.some((e) => !EMAIL_RE.test(e))) return setState({ ...state, error: 'Enter a valid email address.' });
    if (/\[Please /.test(state.message)) return setState({ ...state, error: 'The message still has a [Please …] placeholder — fill it in (Invoice Settings → Refund policy) or edit it here.' });
    setState({ ...state, sending: true, error: '' });
    const { error } = await supabase.from('email_queue').insert({
      type: 'welcome',
      student_id: student.id,
      recipient_email: emails.join(', '),
      payload: { subject: state.subject, message: state.message },
    });
    if (error) return setState({ ...state, sending: false, error: 'Could not send: ' + error.message });
    const at = new Date().toISOString();
    await supabase.from('students').update({ welcome_sent_at: at }).eq('id', student.id);
    onSent && onSent(at);
  }

  return (
    <Modal
      title={`Welcome email — ${student.name}`}
      maxWidth={640}
      onClose={onClose}
      footer={
        <>
          <button className="dp-btn" onClick={onClose}>{onSent ? 'Skip' : 'Cancel'}</button>
          <button className="dp-btn dp-btn-primary" disabled={state.sending} onClick={send}><Mail size={15} /> Send</button>
        </>
      }
    >
      {student.welcome_sent_at && <p style={{ fontSize: 12.5, color: '#854F0B', margin: '0 0 10px' }}>Already sent on {new Date(student.welcome_sent_at).toLocaleDateString('en-CA')}.</p>}
      <Field label="To (comma-separated)"><input className="dp-input" style={{ width: '100%' }} value={state.to} onChange={(e) => setState({ ...state, to: e.target.value })} /></Field>
      <Field label="Subject"><input className="dp-input" style={{ width: '100%' }} value={state.subject} onChange={(e) => setState({ ...state, subject: e.target.value })} /></Field>
      <Field label="Message (edit for this family if needed)">
        <textarea className="dp-input" rows={16} style={{ width: '100%', resize: 'vertical', fontSize: 13, lineHeight: 1.5 }} value={state.message} onChange={(e) => setState({ ...state, message: e.target.value })} />
      </Field>
      {state.error && <p style={{ color: '#9A2B2B', fontSize: 13, margin: 0 }}>{state.error}</p>}
    </Modal>
  );
}
