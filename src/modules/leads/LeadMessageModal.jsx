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
// Online registration form (the live site, so links work from any preview too).
export const JOIN_LINK = 'https://dojang-portal.netlify.app/join';
const DOJANG = 'Edmonton Champion Hankook Taekwondo';
const PHONE = '780-450-0181';

// Under 10 → Beginner, 11 and up → Intermediate B (10 defaults to Beginner).
export const classForAge = (age) => (Number(age) >= 11 ? 'intB' : 'beginner');

const first = (name) => String(name || '').trim().split(/\s+/)[0] || '';
const list = (xs) => (xs.length <= 1 ? xs[0] || '' : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);

// kids: [{ name, age, cls }] — siblings in the same class share one line.
// A child without a name is called by age ("your 8-year-old"), or just "your child".
const labelOf = (k, many) => first(k.name) || (k.age !== '' && k.age != null ? `your ${k.age}-year-old` : many ? 'one of your children' : 'your child');

export function leadMessage({ lead, kids, kidsport, join = true, kind }) {
  const named = kids.filter((k) => first(k.name));
  const many = kids.length > 1;
  const noNames = !named.length;
  const ages = kids.every((k) => k.age !== '' && k.age != null);
  const groups = Object.keys(TRIAL_CLASSES)
    .map((cls) => ({ c: TRIAL_CLASSES[cls], kids: kids.filter((k) => k.cls === cls) }))
    .filter((g) => g.kids.length);
  // Everyone: names if we have them; otherwise "your children" / "your child".
  const who = noNames ? (many ? 'your children' : 'your child') : list(kids.map((k) => labelOf(k, many)));
  const Who = who.charAt(0).toUpperCase() + who.slice(1);
  const nameOf = (g) => {
    if (noNames && !ages) return groups.length === 1 ? who : list(g.kids.map((k) => labelOf(k, many)));
    return list(g.kids.map((k) => labelOf(k, many)));
  };
  const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
  const hello = lead.guardian_name ? `Hello ${first(lead.guardian_name)},` : 'Hello,';
  const kidsportText = many
    ? `please sign up first at ${KIDSPORT_URL} — once you bring in the enrollment forms, we'll give you the Proof of Enrollment and the info you need to apply.`
    : `please sign up first at ${KIDSPORT_URL} — once you bring in the enrollment form, we'll give you the Proof of Enrollment and the info you need to apply.`;
  if (kind === 'text') {
    const offer =
      groups.length === 1
        ? `${Who} can try our ${groups[0].c.label} class (${groups[0].c.short}).`
        : groups.map((g) => `${cap(nameOf(g))}: ${g.c.label} class (${g.c.short})`).join('\n');
    return [
      `${hello} this is Master Daisy from ${DOJANG}. Thank you for your interest!`,
      `${groups.length === 1 ? offer : 'For the trial classes:\n' + offer}\nWhich date works best for the trial class${many ? 'es' : ''}?`,
      join ? `When you're ready to join, you can register online here: ${JOIN_LINK}` : '',
      kidsport ? `For the KidSport grant: ${kidsportText}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
  }
  const offer =
    groups.length === 1
      ? `For ${noNames ? (many ? 'your children’s ages' : 'your child’s age') : many ? 'their ages' : who + '’s age'}, the best fit is our ${groups[0].c.label} class:\n${groups[0].c.when}`
      : 'For their ages, the best fit is:\n' + groups.map((g) => `• ${cap(nameOf(g))} — ${g.c.label} class: ${g.c.when}`).join('\n');
  return {
    subject: named.length === kids.length ? `Trial class for ${who} — ${DOJANG}` : `Trial class — ${DOJANG}`,
    body: [
      hello,
      `Thank you for your interest in ${DOJANG}! We would love to have ${who} join us for a trial class.`,
      offer,
      'Please reply with the date that works best for you, and we will book the trial class' + (many ? 'es.' : '.'),
      join ? `When you're ready to join, you can register online here (it takes about 5 minutes):\n${JOIN_LINK}` : '',
      kidsport
        ? `KidSport grant (help with fees for families who qualify):\n1. First, sign up for an account here: ${KIDSPORT_URL}\n2. When you bring in the enrollment form${many ? 's' : ''}, we will give you the Proof of Enrollment and all the information you need for the application.`
        : '',
      `If you have any questions, just reply to this email or call us at ${PHONE}.`,
      'Best Regards,\nMaster Daisy\n' + DOJANG,
    ]
      .filter(Boolean)
      .join('\n\n'),
  };
}

const kidsOf = (lead) =>
  (Array.isArray(lead.children) && lead.children.length ? lead.children : [{ name: lead.student_name || '', age: lead.student_age }]).map((k) => ({
    name: k.name || '',
    age: k.age ?? '',
    cls: classForAge(k.age),
  }));

export default function LeadMessageModal({ lead, onClose, onDone }) {
  const [kids, setKids] = useState(kidsOf(lead));
  const [kidsport, setKidsport] = useState(true);
  const [join, setJoin] = useState(true);
  const [kind, setKind] = useState(lead.email ? 'email' : 'text');
  const [email, setEmail] = useState(lead.email || '');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  // Rewrite the message whenever the options change.
  const key = JSON.stringify(kids.map((k) => [k.name, k.cls]));
  useEffect(() => {
    if (kind === 'text') setBody(leadMessage({ lead, kids, kidsport, join, kind }));
    else {
      const m = leadMessage({ lead, kids, kidsport, join, kind });
      setSubject(m.subject);
      setBody(m.body);
    }
  }, [key, kidsport, join, kind]);
  const setKid = (i, patch) => setKids(kids.map((k, j) => (j === i ? { ...k, ...patch } : k)));

  async function markContacted(how) {
    const patch = { contacted_at: new Date().toISOString(), contacted_by: how };
    const children = kids.map((k) => ({ name: k.name, age: k.age === '' ? null : Number(k.age) }));
    if (JSON.stringify(children) !== JSON.stringify(lead.children || null)) {
      patch.children = children;
      patch.student_age = children[0]?.age ?? null;
    }
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

      <div style={{ marginBottom: 10 }}>
        {kids.map((k, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
            <span style={{ minWidth: 110, fontSize: 13.5, fontWeight: 500 }}>{k.name || <span style={{ color: '#8A8D84', fontWeight: 400 }}>{kids.length > 1 ? `Child ${i + 1}` : 'Child'} (no name)</span>}</span>
            <input className="dp-input" inputMode="numeric" aria-label="Age" placeholder="Age" style={{ width: 58 }} value={k.age} onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 2); setKid(i, v === '' ? { age: v } : { age: v, cls: classForAge(v) }); }} />
            {Object.entries(TRIAL_CLASSES).map(([c, t]) => (
              <button key={c} className="dp-btn" onClick={() => setKid(i, { cls: c })} style={{ fontSize: 12.5, background: k.cls === c ? '#20241F' : '#fff', color: k.cls === c ? '#fff' : '#20241F' }}>
                {t.label} · {t.short}
              </button>
            ))}
          </div>
        ))}
        <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
          <input type="checkbox" checked={kidsport} onChange={(e) => setKidsport(e.target.checked)} /> Include KidSport grant info
        </label>
        <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <input type="checkbox" checked={join} onChange={(e) => setJoin(e.target.checked)} /> Include the online registration link
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
