import React, { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { supabase } from '../supabaseClient';
import Modal from './Modal';
import Field from './Field';
import { fillFamilyWelcome, withPortalLink } from '../lib/welcomeEmail';
import { notice } from '../lib/dialogs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const splitEmails = (v) => String(v || '').split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean);

// Preview, edit and send the welcome email — for one student, or one email
// for siblings registered together (pass `students`).
export default function WelcomeEmailModal({ student, students: many, onClose, onSent }) {
  const students = many && many.length ? many : [student];
  student = students[0];
  const [state, setState] = useState(null);

  useEffect(() => {
    Promise.all([
      supabase.from('invoice_settings').select('*').eq('id', 1).maybeSingle(),
      supabase.from('class_schedule').select('class_name, weekday, start_time, end_time').eq('active', true).order('weekday').order('start_time'),
      student.customer_id ? supabase.from('customers').select('portal_invited_at').eq('id', student.customer_id).maybeSingle() : Promise.resolve({ data: null }),
    ]).then(([{ data: st }, { data: schedule }, { data: fam }]) => {
        // The class days and times go into {classes}.
        const s = { ...(st || {}), schedule: schedule || [] };
        setState({
          to: student.guardian_email || '',
          subject: fillFamilyWelcome(s.welcome_subject || 'Welcome to {business}, {student}!', students, s),
          message: withPortalLink(fillFamilyWelcome(s.welcome_message || '', students, s), students, s),
          // The password link comes from the parent-portal invite (its own email).
          invite: !!student.customer_id && !fam?.portal_invited_at,
          invitedAt: fam?.portal_invited_at || null,
          error: '',
          sending: false,
        });
      });
  }, [students.map((x) => x.id).join()]);

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
    await supabase.from('students').update({ welcome_sent_at: at }).in('id', students.map((x) => x.id));
    if (state.invite && student.customer_id) {
      const { data, error: invErr } = await supabase.functions.invoke('parent-portal', { body: { action: 'invite', customer_id: student.customer_id, origin: window.location.origin } });
      const skipped = data?.skipped || [];
      if (invErr || data?.error || (!data?.sent?.length && skipped.length)) {
        const why = invErr?.message || data?.error || skipped.map((x) => `${x.email}: ${x.reason}`).join('; ');
        onSent && onSent(at);
        notice(`The welcome email was sent, but the parent portal login wasn't: ${why}. You can send it again from the student's profile (Parent portal).`, { title: 'Parent portal login not sent' });
        return;
      }
    }
    onSent && onSent(at);
  }

  return (
    <Modal
      title={`Welcome email — ${students.map((x) => x.name).join(', ')}`}
      maxWidth={640}
      onClose={onClose}
      footer={
        <>
          <button className="dp-btn" onClick={onClose}>{onSent ? 'Skip' : 'Cancel'}</button>
          <button className="dp-btn dp-btn-primary" disabled={state.sending} onClick={send}><Mail size={15} /> Send</button>
        </>
      }
    >
      {student.welcome_sent_at && <p style={{ fontSize: 12.5, color: 'var(--dp-warning)', margin: '0 0 10px' }}>Already sent on {new Date(student.welcome_sent_at).toLocaleDateString('en-CA')}.</p>}
      <Field label="To (comma-separated)"><input className="dp-input" style={{ width: '100%' }} value={state.to} onChange={(e) => setState({ ...state, to: e.target.value })} /></Field>
      <Field label="Subject"><input className="dp-input" style={{ width: '100%' }} value={state.subject} onChange={(e) => setState({ ...state, subject: e.target.value })} /></Field>
      <Field label="Message (edit for this family if needed)">
        <textarea className="dp-input" rows={16} style={{ width: '100%', resize: 'vertical', fontSize: 13, lineHeight: 1.5 }} value={state.message} onChange={(e) => setState({ ...state, message: e.target.value })} />
      </Field>
      {student.customer_id && (
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13.5, margin: '4px 0 12px', cursor: 'pointer' }}>
          <input type="checkbox" style={{ marginTop: 3 }} checked={state.invite} onChange={(e) => setState({ ...state, invite: e.target.checked })} />
          <span>
            Also send the parent portal login (a separate email with a set-password link)
            {state.invitedAt && <span style={{ display: 'block', fontSize: 12, color: 'var(--dp-ink-soft)' }}>Already sent {new Date(state.invitedAt).toLocaleDateString('en-CA')} — tick to send a new link.</span>}
          </span>
        </label>
      )}
      {state.error && <p style={{ color: 'var(--dp-danger)', fontSize: 13, margin: 0 }}>{state.error}</p>}
    </Modal>
  );
}
