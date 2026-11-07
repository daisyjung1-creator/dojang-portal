import React, { useEffect, useState } from 'react';
import { Mail, MessageSquare, Copy, Send } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import Modal from '../../components/Modal';
import { confirmSend } from '../../components/ConfirmSend';

// Reply to a new inquiry by email or text: offer a trial class that fits the
// child's age and, if wanted, explain how the KidSport grant works.
export const TRIAL_CLASSES = {
  beginner: { label: 'Beginner', when: 'Tuesdays and Thursdays, 4:30–5:20 pm', short: 'Tue/Thu 4:30–5:20pm' },
  intB: { label: 'Intermediate B', when: 'Mondays and Wednesdays, 4:30–5:20 pm', short: 'Mon/Wed 4:30–5:20pm' },
};
export const KIDSPORT_URL = 'https://kidsport.smartsimple.ca/s_Login.jsp';
const DOJANG = 'Edmonton Champion Hankook Taekwondo';
const PHONE = '780-450-0181';

// Under 10 → Beginner, 11 and up → Intermediate B (10 defaults to Beginner).
export const classForAge = (age) => (Number(age) >= 11 ? 'intB' : 'beginner');

const first = (name) => String(name || '').trim().split(/\s+/)[0] || '';

export function leadMessage({ lead, cls, kidsport, kind }) {
  const c = TRIAL_CLASSES[cls];
  const kid = first(lead.student_name) || 'your child';
  const Kid = kid.charAt(0).toUpperCase() + kid.slice(1);
  const kids = first(lead.student_name) ? `${kid}'s` : "your child's";
  const hello = lead.guardian_name ? `Hello ${first(lead.guardian_name)},` : 'Hello,';
  if (kind === 'text') {
    return [
      `${hello} this is Master Daisy from ${DOJANG}. Thank you for your interest!`,
      `${Kid} can try our ${c.label} class (${c.short}). Which date works best for the trial class?`,
      kidsport ? `For the KidSport grant: please sign up first at ${KIDSPORT_URL} — once you bring in the enrollment form, we'll give you the Proof of Enrollment and the info you need to apply.` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
  }
  return {
    subject: first(lead.student_name) ? `Trial class for ${kid} — ${DOJANG}` : `Trial class — ${DOJANG}`,
    body: [
      hello,
      `Thank you for your interest in ${DOJANG}! We would love to have ${kid} join us for a trial class.`,
      `For ${kids} age, the best fit is our ${c.label} class:\n${c.when}`,
      'Please reply with the date that works best for you, and we will book the trial class.',
      kidsport
        ? `KidSport grant (help with fees for families who qualify):\n1. First, sign up for an account here: ${KIDSPORT_URL}\n2. When you bring in the enrollment form, we will give you the Proof of Enrollment and all the information you need for the application.`
        : '',
      `If you have any questions, just reply to this email or call us at ${PHONE}.`,
      'Best Regards,\nMaster Daisy\n' + DOJANG,
    ]
      .filter(Boolean)
      .join('\n\n'),
  };
}

export default function LeadMessageModal({ lead, onClose, onDone }) {
  const [age, setAge] = useState(lead.student_age ?? '');
  const [cls, setCls] = useState(classForAge(lead.student_age));
  const [kidsport, setKidsport] = useState(true);
  const [kind, setKind] = useState(lead.email ? 'email' : 'text');
  const [email, setEmail] = useState(lead.email || '');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  // Rewrite the message whenever the options change.
  useEffect(() => {
    if (kind === 'text') setBody(leadMessage({ lead, cls, kidsport, kind }));
    else {
      const m = leadMessage({ lead, cls, kidsport, kind });
      setSubject(m.subject);
      setBody(m.body);
    }
  }, [cls, kidsport, kind]);

  async function markContacted(how) {
    const patch = { contacted_at: new Date().toISOString(), contacted_by: how };
    if (age !== '' && Number(age) !== lead.student_age) patch.student_age = Number(age);
    if (how === 'email' && email && email !== lead.email) patch.email = email;
    const { data } = await supabase.from('leads').update(patch).eq('id', lead.id).select().single();
    onDone(data || { ...lead, ...patch });
  }

  async function sendEmail() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+/.test(email)) return setMsg('Add a valid email address.');
    if (!(await confirmSend({ what: subject, to: email }))) return;
    setBusy(true);
    const { error } = await supabase.from('email_queue').insert({ type: 'tryout_confirmation', recipient_email: email, payload: { subject, message: body, lead_id: lead.id } });
    setBusy(false);
    if (error) return setMsg('Could not send: ' + error.message);
    await markContacted('email');
    onClose('Email sent to ' + email + '.');
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(body);
    } catch {
      const t = document.createElement('textarea');
      t.value = body;
      document.body.appendChild(t);
      t.select();
      document.execCommand('copy');
      t.remove();
    }
    setMsg('Copied — paste it into your text message.');
    await markContacted('text');
  }

  const phone = String(lead.phone || '').replace(/[^\d+]/g, '');
  const smsHref = `sms:${phone}${/iPhone|iPad|Mac/i.test(navigator.userAgent) ? '&' : '?'}body=${encodeURIComponent(body)}`;

  const tab = (k, Icon, label) => (
    <button className="dp-btn" onClick={() => setKind(k)} style={{ background: kind === k ? '#20241F' : '#fff', color: kind === k ? '#fff' : '#20241F' }}>
      <Icon size={14} /> {label}
    </button>
  );

  return (
    <Modal
      title={`Reply to ${lead.guardian_name || lead.student_name}`}
      maxWidth={640}
      onClose={() => onClose()}
      footer={
        <>
          {msg && <span style={{ marginRight: 'auto', fontSize: 12.5, color: msg.startsWith('Could') || msg.startsWith('Add') ? '#9A2B2B' : '#2A5A30' }}>{msg}</span>}
          <button className="dp-btn" onClick={() => onClose()}>Close</button>
          {kind === 'email' ? (
            <button className="dp-btn dp-btn-primary" disabled={busy} onClick={sendEmail}><Send size={14} /> Send email</button>
          ) : (
            <>
              <button className="dp-btn" onClick={copyText}><Copy size={14} /> Copy text</button>
              {phone && (
                <a className="dp-btn dp-btn-primary" href={smsHref} onClick={() => markContacted('text')} style={{ textDecoration: 'none' }}>
                  <MessageSquare size={14} /> Open in Messages
                </a>
              )}
            </>
          )}
        </>
      }
    >
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {tab('email', Mail, 'Email')}
        {tab('text', MessageSquare, 'Text message')}
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
        <label style={{ fontSize: 12.5, color: '#5B5F56' }}>
          Child’s age
          <input className="dp-input" inputMode="numeric" style={{ display: 'block', width: 70, marginTop: 3 }} value={age} onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 2); setAge(v); if (v !== '') setCls(classForAge(v)); }} />
        </label>
        <div style={{ fontSize: 12.5, color: '#5B5F56' }}>
          Trial class
          <div style={{ display: 'flex', gap: 5, marginTop: 3 }}>
            {Object.entries(TRIAL_CLASSES).map(([k, c]) => (
              <button key={k} className="dp-btn" onClick={() => setCls(k)} style={{ fontSize: 12.5, background: cls === k ? '#20241F' : '#fff', color: cls === k ? '#fff' : '#20241F' }}>
                {c.label} · {c.short}
              </button>
            ))}
          </div>
        </div>
        <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 6 }}>
          <input type="checkbox" checked={kidsport} onChange={(e) => setKidsport(e.target.checked)} /> Include KidSport grant info
        </label>
      </div>
      <p style={{ fontSize: 11.5, color: '#8A8D84', margin: '-6px 0 12px' }}>Under 10 → Beginner · 11 and up → Intermediate B (10 years old: pick one).</p>

      {kind === 'email' ? (
        <>
          <label style={{ display: 'block', fontSize: 12.5, color: '#5B5F56', marginBottom: 8 }}>
            To
            <input className="dp-input" style={{ display: 'block', width: '100%', marginTop: 3 }} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="parent@email.com" />
          </label>
          <label style={{ display: 'block', fontSize: 12.5, color: '#5B5F56', marginBottom: 8 }}>
            Subject
            <input className="dp-input" style={{ display: 'block', width: '100%', marginTop: 3 }} value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
        </>
      ) : (
        <p style={{ fontSize: 12.5, color: '#5B5F56', margin: '0 0 8px' }}>
          To: <b>{lead.phone || 'no phone number'}</b> · “Open in Messages” opens your phone or computer’s messaging app with this text filled in.
        </p>
      )}
      <textarea className="dp-input" style={{ width: '100%', minHeight: kind === 'email' ? 280 : 170, fontSize: 13.5, lineHeight: 1.5 }} value={body} onChange={(e) => setBody(e.target.value)} />
      {lead.contacted_at && (
        <p style={{ fontSize: 12, color: '#8A8D84', margin: '6px 0 0' }}>
          Last contacted {new Date(lead.contacted_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })} by {lead.contacted_by || '—'}.
        </p>
      )}
    </Modal>
  );
}
