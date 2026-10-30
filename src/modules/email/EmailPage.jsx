import React, { useEffect, useMemo, useState } from 'react';
import { Send, Users, RefreshCw } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import Field from '../../components/Field';
import Modal from '../../components/Modal';
import { splitClasses, allClassNames } from '../../lib/classes';

// Group email: write one message and send it to every family, or only to
// families with a student in chosen classes (e.g. Comp Team). Each family gets
// its own copy, so parents never see each other's addresses. Siblings are
// grouped so a family gets the message once.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const splitEmails = (v) => String(v || '').split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter((e) => EMAIL_RE.test(e));

const DEFAULT_MESSAGE = 'Hello {guardian},\n\n\n\nBest Regards,\nMaster Daisy';

function personalize(text, fam) {
  const kids = fam.students.map((s) => s.name.split(' ')[0]);
  const kidList = kids.length <= 2 ? kids.join(' & ') : kids.slice(0, -1).join(', ') + ' & ' + kids[kids.length - 1];
  return String(text || '')
    .replaceAll('{guardian}', fam.guardian || 'Parent/Guardian')
    .replaceAll('{student}', kidList);
}

export default function EmailPage() {
  const [students, setStudents] = useState([]);
  const [mode, setMode] = useState('all'); // all | classes | subsidy
  const [classes, setClasses] = useState(new Set());
  const [excluded, setExcluded] = useState(new Set());
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [flash, setFlash] = useState({ text: '', error: false });
  const [history, setHistory] = useState([]);

  useEffect(() => {
    supabase
      .from('students')
      .select('id, name, class_name, guardian_name, guardian_email, status, subsidy')
      .order('name')
      .then(({ data }) => setStudents((data || []).filter((s) => s.status !== 'withdrawn')));
    loadHistory();
  }, []);

  async function loadHistory() {
    const { data: b } = await supabase.from('email_broadcasts').select('*').order('created_at', { ascending: false }).limit(20);
    if (!b || !b.length) return setHistory([]);
    const { data: q } = await supabase.from('email_queue').select('broadcast_id, sent, error').in('broadcast_id', b.map((x) => x.id));
    setHistory(
      b.map((x) => {
        const rows = (q || []).filter((r) => r.broadcast_id === x.id);
        return { ...x, sent: rows.filter((r) => r.sent).length, failed: rows.filter((r) => !r.sent && r.error).length, pending: rows.filter((r) => !r.sent && !r.error).length };
      })
    );
  }

  const classCounts = useMemo(() => {
    const m = {};
    students.forEach((s) => splitClasses(s.class_name).forEach((c) => (m[c] = (m[c] || 0) + 1)));
    return allClassNames(students).filter((c) => m[c]).map((c) => [c, m[c]]);
  }, [students]);

  const chosen = useMemo(
    () =>
      students.filter((s) => {
        if (mode === 'classes') return splitClasses(s.class_name).some((c) => classes.has(c));
        if (mode === 'subsidy') return s.subsidy;
        return true;
      }),
    [students, mode, classes]
  );

  // One entry per family: siblings sharing any guardian email are merged.
  const families = useMemo(() => {
    const byEmail = {};
    const list = [];
    chosen.forEach((s) => {
      const emails = splitEmails(s.guardian_email);
      if (!emails.length) return;
      let fam = emails.map((e) => byEmail[e]).find(Boolean);
      if (!fam) {
        fam = { key: emails[0], emails: [], students: [], guardian: s.guardian_name || '' };
        list.push(fam);
      }
      fam.students.push(s);
      emails.forEach((e) => {
        if (!fam.emails.includes(e)) fam.emails.push(e);
        byEmail[e] = fam;
      });
    });
    return list;
  }, [chosen]);

  const noEmail = chosen.filter((s) => !splitEmails(s.guardian_email).length);
  const recipients = families.filter((f) => !excluded.has(f.key));
  const audienceLabel = mode === 'all' ? 'All active students' : mode === 'subsidy' ? 'Students with a subsidy' : [...classes].join(', ') || '(no class chosen)';

  function check() {
    if (!subject.trim()) return say('Please enter a subject.', true);
    if (!message.trim()) return say('Please write a message.', true);
    if (!recipients.length) return say('No families to send to.', true);
    setConfirm(true);
  }

  function say(text, error = false) {
    setFlash({ text, error });
  }

  async function send() {
    setSending(true);
    const { data: b, error: e1 } = await supabase
      .from('email_broadcasts')
      .insert({ subject: subject.trim(), message, audience: audienceLabel, recipient_count: recipients.length })
      .select()
      .single();
    if (e1) {
      setSending(false);
      setConfirm(false);
      return say('Could not send: ' + e1.message, true);
    }
    const rows = recipients.map((f) => ({
      type: 'broadcast',
      broadcast_id: b.id,
      student_id: f.students[0]?.id || null,
      recipient_email: f.emails.join(', '),
      payload: { subject: personalize(subject.trim(), f), message: personalize(message, f) },
    }));
    for (let i = 0; i < rows.length; i += 50) {
      const { error } = await supabase.from('email_queue').insert(rows.slice(i, i + 50));
      if (error) {
        setSending(false);
        setConfirm(false);
        return say(`Stopped after ${i} emails: ${error.message}`, true);
      }
    }
    setSending(false);
    setConfirm(false);
    setSubject('');
    setMessage(DEFAULT_MESSAGE);
    setExcluded(new Set());
    say(`Sending to ${rows.length} families. It can take a minute or two — check the history below.`);
    setTimeout(loadHistory, 4000);
  }

  async function retryFailed() {
    say('Retrying…');
    const { error } = await supabase.functions.invoke('send-emails', { body: {} });
    say(error ? 'Some emails still failed. Check the email address or try again later.' : 'Retried.', !!error);
    loadHistory();
  }

  const tab = (id, label) => (
    <button
      className="dp-btn"
      style={{ background: mode === id ? '#20241F' : '#FFFFFF', color: mode === id ? '#FFFFFF' : '#20241F', borderColor: mode === id ? '#20241F' : '#DEDACC' }}
      onClick={() => {
        setMode(id);
        setExcluded(new Set());
      }}
    >
      {label}
    </button>
  );
  const preview = recipients[0];

  return (
    <>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Email</h1>
          <p style={styles.subtitle}>Send a message to all families or to a class group</p>
        </div>
      </div>
      {flash.text && <p style={{ background: flash.error ? '#FBEAEA' : '#E8F1E9', color: flash.error ? '#9A2B2B' : '#2A5A30', padding: '8px 12px', borderRadius: 6, fontSize: 13, margin: '0 0 12px' }}>{flash.text}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>
        <div style={{ ...styles.card, padding: 18 }}>
          <p style={{ ...styles.metricLabel, marginBottom: 8 }}>Send to</p>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
            {tab('all', 'All families')}
            {tab('classes', 'Class groups')}
            {tab('subsidy', 'Subsidy families')}
          </div>
          {mode === 'classes' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {classCounts.length === 0 && <span style={{ fontSize: 13, color: '#8A8D84' }}>No classes set on students yet.</span>}
              {classCounts.map(([c, n]) => {
                const on = classes.has(c);
                return (
                  <button
                    key={c}
                    className="dp-btn"
                    style={{ padding: '4px 10px', fontSize: 12.5, background: on ? '#9A2B2B' : '#fff', color: on ? '#fff' : '#20241F', borderColor: on ? '#711F1F' : '#DEDACC' }}
                    onClick={() => {
                      const s = new Set(classes);
                      on ? s.delete(c) : s.add(c);
                      setClasses(s);
                    }}
                  >
                    {c} <span style={{ opacity: 0.7 }}>({n})</span>
                  </button>
                );
              })}
            </div>
          )}

          <Field label="Subject" required>
            <input className="dp-input" style={{ width: '100%' }} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Comp Team practice change this Saturday" />
          </Field>
          <Field label="Message" required>
            <textarea className="dp-input" rows={14} style={{ width: '100%', resize: 'vertical', fontSize: 13.5, lineHeight: 1.5 }} value={message} onChange={(e) => setMessage(e.target.value)} />
          </Field>
          <p style={{ fontSize: 12, color: '#8A8D84', margin: '-4px 0 14px' }}>
            {'{guardian}'} = parent's name · {'{student}'} = their child's first name (siblings: "Adam & Lily"). Links become clickable.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="dp-btn dp-btn-primary" onClick={check} disabled={sending}>
              <Send size={15} /> Review & Send to {recipients.length} {recipients.length === 1 ? 'family' : 'families'}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={styles.card}>
            <div style={{ padding: '12px 12px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ ...styles.metricLabel, margin: 0 }}>
                <Users size={13} style={{ verticalAlign: -2 }} /> {recipients.length} families · {chosen.length} students
              </span>
              {excluded.size > 0 && <button className="dp-btn" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => setExcluded(new Set())}>Include all</button>}
            </div>
            <div style={{ maxHeight: 340, overflowY: 'auto', padding: '0 12px 10px' }}>
              {families.map((f) => (
                <label key={f.key} style={{ display: 'flex', gap: 8, fontSize: 13, padding: '5px 0', borderBottom: '1px solid #F1EFE7', alignItems: 'flex-start' }}>
                  <input
                    type="checkbox"
                    checked={!excluded.has(f.key)}
                    onChange={(e) => {
                      const s = new Set(excluded);
                      e.target.checked ? s.delete(f.key) : s.add(f.key);
                      setExcluded(s);
                    }}
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    <b style={{ fontWeight: 500 }}>{f.students.map((s) => s.name).join(', ')}</b>
                    <span style={{ color: '#8A8D84' }}> · {f.emails.join(', ')}</span>
                  </span>
                </label>
              ))}
              {families.length === 0 && <p style={{ fontSize: 13, color: '#8A8D84' }}>Nobody in this group yet.</p>}
              {noEmail.length > 0 && (
                <p style={{ fontSize: 12.5, color: '#854F0B', margin: '8px 0 0' }}>
                  No email on file (won't receive it): {noEmail.map((s) => s.name).join(', ')}
                </p>
              )}
            </div>
          </div>

          <div style={styles.card}>
            <div style={{ padding: '12px 12px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ ...styles.metricLabel, margin: 0 }}>Sent emails</span>
              <button className="dp-btn" style={{ padding: '2px 8px', fontSize: 12 }} onClick={loadHistory}><RefreshCw size={12} /> Refresh</button>
            </div>
            {history.length === 0 ? (
              <p style={{ padding: '6px 12px 12px', fontSize: 13, color: '#8A8D84' }}>None yet.</p>
            ) : (
              <table className="dp-table">
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td style={{ fontSize: 12.5 }}>
                        <div style={{ fontWeight: 500 }}>{h.subject}</div>
                        <div style={{ color: '#8A8D84' }}>{new Date(h.created_at).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · {h.audience}</div>
                      </td>
                      <td style={{ fontSize: 12.5, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span style={{ color: '#2A5A30' }}>{h.sent}/{h.recipient_count} sent</span>
                        {h.pending > 0 && <div style={{ color: '#8A8D84' }}>{h.pending} sending…</div>}
                        {h.failed > 0 && (
                          <div>
                            <span style={{ color: '#9A2B2B' }}>{h.failed} failed </span>
                            <button className="dp-btn" style={{ padding: '1px 6px', fontSize: 11.5 }} onClick={retryFailed}>Retry</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {confirm && preview && (
        <Modal
          title={`Send to ${recipients.length} ${recipients.length === 1 ? 'family' : 'families'}?`}
          maxWidth={600}
          onClose={() => !sending && setConfirm(false)}
          footer={
            <>
              <button className="dp-btn" onClick={() => setConfirm(false)} disabled={sending}>Cancel</button>
              <button className="dp-btn dp-btn-primary" onClick={send} disabled={sending}><Send size={15} /> {sending ? 'Sending…' : 'Send now'}</button>
            </>
          }
        >
          <p style={{ fontSize: 13, color: '#5B5F56', marginTop: 0 }}>
            {audienceLabel} · preview of the email to <b>{preview.emails.join(', ')}</b>:
          </p>
          <div style={{ border: '1px solid #EDEAE0', borderRadius: 8, padding: 14, fontSize: 13.5, lineHeight: 1.55 }}>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>{personalize(subject, preview)}</div>
            <div style={{ whiteSpace: 'pre-line' }}>{personalize(message, preview)}</div>
          </div>
        </Modal>
      )}
    </>
  );
}
