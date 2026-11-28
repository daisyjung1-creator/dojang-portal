import React, { useEffect, useMemo, useState } from 'react';
import { Send, Users, RefreshCw, Copy, Paperclip, X, Mail } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import Field from '../../components/Field';
import Modal from '../../components/Modal';
import { splitClasses, allClassNames } from '../../lib/classes';
import PortalInvites from './PortalInvites';
import EmailLog from './EmailLog';
import MessagePreview from './MessagePreview';
import { matchScore } from '../../components/SearchSelect';

// Group email: write one message and send it to every family, or only to
// families with a student in chosen classes (e.g. Comp Team). Each family gets
// its own copy, so parents never see each other's addresses. Siblings are
// grouped so a family gets the message once.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const splitEmails = (v) => String(v || '').split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter((e) => EMAIL_RE.test(e));

const DEFAULT_MESSAGE = 'Hello {guardian},\n\n\n\nBest Regards,\nMaster Daisy';

// Attachments: stored once (email_attachments), every family's email lists them.
const MAX_FILES = 5;
const MAX_TOTAL = 10 * 1024 * 1024; // 10 MB together
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.gif,.heic,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv';
const BLOCKED = /\.(exe|bat|cmd|com|js|vbs|scr|msi|sh|jar|apk|zip|rar|7z)$/i;
export const fileSize = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const readBase64 = (file) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] || '');
    r.onerror = rej;
    r.readAsDataURL(file);
  });

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
  const [page, setPage] = useState('compose'); // compose | log
  const [find, setFind] = useState('');
  const [viewing, setViewing] = useState(null);
  const [files, setFiles] = useState([]);
  const [testing, setTesting] = useState(false);
  const [ownEmail, setOwnEmail] = useState('');
  useEffect(() => {
    supabase.from('invoice_settings').select('email').eq('id', 1).maybeSingle().then(({ data }) => setOwnEmail(data?.email || ''));
  }, []); // { name, mime, size, data? , id? (already stored) }
  const total = files.reduce((t, f) => t + f.size, 0);

  async function addFiles(list) {
    const next = [...files];
    for (const f of list) {
      if (next.length >= MAX_FILES) { say(`Up to ${MAX_FILES} files per email.`, true); break; }
      if (BLOCKED.test(f.name)) { say(`${f.name}: this kind of file can't be attached.`, true); continue; }
      if (next.reduce((t, x) => t + x.size, 0) + f.size > MAX_TOTAL) { say(`${f.name} is too big — attachments can be ${fileSize(MAX_TOTAL)} in total. Try a PDF or a smaller photo.`, true); continue; }
      next.push({ name: f.name, mime: f.type || 'application/octet-stream', size: f.size, data: await readBase64(f) });
    }
    setFiles(next);
  }

  function reuse(item) {
    setSubject(item.subject || '');
    setMessage(item.message || DEFAULT_MESSAGE);
    setFiles((item.attachments || []).map((a) => ({ id: a.id, name: a.name, size: a.size || 0, mime: '' })));
    setViewing(null);
    setPage('compose');
    say('Message copied into Group email — check who it goes to, then send.');
  }

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

  // Checked families' emails, ready to paste into Gmail / Outlook (use BCC).
  async function copyEmails() {
    const list = [...new Set(recipients.flatMap((f) => f.emails))];
    const text = list.join(', ');
    try {
      await navigator.clipboard.writeText(text);
    } catch (_e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    say(`Copied ${list.length} email${list.length === 1 ? '' : 's'} — paste them into the BCC line of your own email.`);
  }

  function check() {
    if (!subject.trim()) return say('Please enter a subject.', true);
    if (!message.trim()) return say('Please write a message.', true);
    if (!recipients.length) return say('No families to send to.', true);
    setConfirm(true);
  }

  function say(text, error = false) {
    setFlash({ text, error });
  }

  // Save new attachments once; already-saved ones (test send, "Use again") keep their id.
  async function storeFiles() {
    const stored = [];
    const next = [];
    for (const f of files) {
      if (f.id) {
        stored.push({ id: f.id, name: f.name, size: f.size });
        next.push(f);
        continue;
      }
      const { data: a, error } = await supabase.from('email_attachments').insert({ file_name: f.name, mime: f.mime, size_bytes: f.size, data: f.data }).select('id').single();
      if (error) throw new Error(`Could not attach ${f.name}: ${error.message}`);
      stored.push({ id: a.id, name: f.name, size: f.size });
      next.push({ id: a.id, name: f.name, size: f.size, mime: f.mime });
    }
    setFiles(next);
    return stored;
  }

  // One copy to the dojang's own email (as the first family would get it).
  async function sendTest() {
    if (!subject.trim()) return say('Please enter a subject.', true);
    if (!message.trim()) return say('Please write a message.', true);
    if (!ownEmail) return say('Add the dojang email in Invoice Settings first.', true);
    setTesting(true);
    try {
      const stored = await storeFiles();
      const f = preview || { students: [], guardian: '' };
      const { error } = await supabase.from('email_queue').insert({
        type: 'welcome',
        recipient_email: ownEmail,
        payload: { subject: '[Test] ' + personalize(subject.trim(), f), message: personalize(message, f), ...(stored.length ? { attachments: stored.map((a) => a.id) } : {}) },
      });
      if (error) throw error;
      say(`Test sent to ${ownEmail}${preview ? ` (written as ${preview.students.map((x) => x.name.split(' ')[0]).join(' & ')}'s family would get it)` : ''}. Check your inbox in a minute.`);
    } catch (e) {
      say('Test not sent: ' + e.message, true);
    }
    setTesting(false);
  }

  async function send() {
    setSending(true);
    let stored;
    try {
      stored = await storeFiles();
    } catch (e) {
      setSending(false);
      setConfirm(false);
      return say(e.message, true);
    }
    const attachmentIds = stored.map((a) => a.id);
    const { data: b, error: e1 } = await supabase
      .from('email_broadcasts')
      .insert({ subject: subject.trim(), message, audience: audienceLabel, recipient_count: recipients.length, attachments: stored })
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
      payload: { subject: personalize(subject.trim(), f), message: personalize(message, f), ...(attachmentIds.length ? { attachments: attachmentIds } : {}) },
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
    setFiles([]);
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
      style={{ background: mode === id ? 'var(--dp-ink)' : '#FFFFFF', color: mode === id ? '#FFFFFF' : 'var(--dp-ink)', borderColor: mode === id ? 'var(--dp-ink)' : 'var(--dp-line)' }}
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
          <p style={styles.subtitle}>{page === 'log' ? 'Every email the portal has sent — invoices, reminders, receipts, makeup, absence and more' : 'Send a message to all families or to a class group'}</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['compose', 'Group email'], ['log', 'Sent emails']].map(([id, label]) => (
            <button key={id} className="dp-btn" style={{ background: page === id ? 'var(--dp-ink)' : '#fff', color: page === id ? '#fff' : 'var(--dp-ink)' }} onClick={() => setPage(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {page === 'log' ? <EmailLog onReuse={reuse} /> : (<>
      <PortalInvites />
      {flash.text && <p style={{ background: flash.error ? 'var(--dp-danger-tint)' : 'var(--dp-success-tint)', color: flash.error ? 'var(--dp-danger)' : 'var(--dp-success)', padding: '8px 12px', borderRadius: 6, fontSize: 13, margin: '0 0 12px' }}>{flash.text}</p>}

      <div className="dp-stack dp-stack-md" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>
        <div style={{ ...styles.card, padding: 18 }}>
          <p style={{ ...styles.metricLabel, marginBottom: 8 }}>Send to</p>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
            {tab('all', 'All families')}
            {tab('classes', 'Class groups')}
            {tab('subsidy', 'Subsidy families')}
          </div>
          {mode === 'classes' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {classCounts.length === 0 && <span style={{ fontSize: 13, color: 'var(--dp-ink-faint)' }}>No classes set on students yet.</span>}
              {classCounts.map(([c, n]) => {
                const on = classes.has(c);
                return (
                  <button
                    key={c}
                    className="dp-btn"
                    style={{ padding: '4px 10px', fontSize: 12.5, background: on ? 'var(--dp-danger)' : '#fff', color: on ? '#fff' : 'var(--dp-ink)', borderColor: on ? 'var(--dp-danger)' : 'var(--dp-line)' }}
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
          <div style={{ margin: '-4px 0 12px' }} data-testid="attachments">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <label className="dp-btn" style={{ cursor: 'pointer', fontSize: 13 }}>
                <Paperclip size={14} /> Attach files
                <input type="file" multiple accept={ACCEPT} style={{ display: 'none' }} onChange={(e) => { addFiles([...e.target.files]); e.target.value = ''; }} aria-label="Attach files" />
              </label>
              <span style={{ fontSize: 12, color: 'var(--dp-ink-faint)' }}>PDF, photos, Word, Excel… up to {MAX_FILES} files, {fileSize(MAX_TOTAL)} total{files.length ? ` · ${fileSize(total)} used` : ''}</span>
            </div>
            {files.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {files.map((f, i) => (
                  <span key={i} data-file={f.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--dp-canvas)', border: '1px solid var(--dp-line)', borderRadius: 999, padding: '3px 6px 3px 10px', fontSize: 12.5 }}>
                    <Paperclip size={12} /> {f.name} <span style={{ color: 'var(--dp-ink-faint)' }}>{f.size ? fileSize(f.size) : ''}</span>
                    <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2, display: 'flex' }}><X size={13} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <p style={{ fontSize: 12, color: 'var(--dp-ink-faint)', margin: '-4px 0 14px' }}>
            {'{guardian}'} = parent's name · {'{student}'} = their child's first name (siblings: "Adam & Lily"). Links become clickable. One copy also goes to the dojang's own email so you can find it later.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
            <button className="dp-btn" onClick={sendTest} disabled={testing || sending} title={ownEmail ? `Send one copy to ${ownEmail} first` : 'Set the dojang email in Invoice Settings'}>
              <Mail size={15} /> {testing ? 'Sending test…' : `Send test to me${ownEmail ? ` (${ownEmail})` : ''}`}
            </button>
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
              <span style={{ display: 'flex', gap: 4 }}>
                <button className="dp-btn" style={{ padding: '2px 8px', fontSize: 12 }} disabled={!excluded.size} onClick={() => setExcluded(new Set())}>Select all</button>
                <button className="dp-btn" style={{ padding: '2px 8px', fontSize: 12 }} disabled={!recipients.length} onClick={() => setExcluded(new Set(families.map((f) => f.key)))}>Clear all</button>
                <button className="dp-btn" style={{ padding: '2px 8px', fontSize: 12 }} disabled={!recipients.length} title="Copy the checked families' emails, to paste into your own email (BCC)" onClick={copyEmails}>
                  <Copy size={12} /> Copy {recipients.length ? recipients.reduce((t, f) => t + f.emails.length, 0) : ''} emails
                </button>
              </span>
            </div>
            <div style={{ padding: '0 12px 6px' }}>
              <input className="dp-input" style={{ width: '100%', padding: '5px 8px', fontSize: 13 }} placeholder="Find a student…" value={find} onChange={(e) => setFind(e.target.value)} />
            </div>
            <div style={{ maxHeight: 340, overflowY: 'auto', padding: '0 12px 10px' }}>
              {families.filter((f) => !find.trim() || matchScore(find, f.students.map((x) => x.name).join(' ') + ' ' + f.emails.join(' ')) !== null).map((f) => (
                <label key={f.key} style={{ display: 'flex', gap: 8, fontSize: 13, padding: '5px 0', borderBottom: '1px solid var(--dp-canvas)', alignItems: 'flex-start' }}>
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
                    <span style={{ color: 'var(--dp-ink-faint)' }}> · {f.emails.join(', ')}</span>
                  </span>
                </label>
              ))}
              {families.length === 0 && <p style={{ fontSize: 13, color: 'var(--dp-ink-faint)' }}>Nobody in this group yet.</p>}
              {noEmail.length > 0 && (
                <p style={{ fontSize: 12.5, color: 'var(--dp-warning)', margin: '8px 0 0' }}>
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
              <p style={{ padding: '6px 12px 12px', fontSize: 13, color: 'var(--dp-ink-faint)' }}>None yet.</p>
            ) : (
              <table className="dp-table">
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} className="dp-row" style={{ cursor: 'pointer' }} title="Click to see the message" onClick={() => setViewing(h)}>
                      <td style={{ fontSize: 12.5 }}>
                        <div style={{ fontWeight: 500 }}>{h.subject}{h.attachments?.length > 0 && <span title={h.attachments.map((a) => a.name).join(', ')} style={{ color: 'var(--dp-ink-faint)', fontWeight: 400 }}> · <Paperclip size={11} style={{ verticalAlign: -1 }} /> {h.attachments.length}</span>}</div>
                        <div style={{ color: 'var(--dp-ink-faint)' }}>{new Date(h.created_at).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · {h.audience}</div>
                      </td>
                      <td style={{ fontSize: 12.5, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span style={{ color: 'var(--dp-success)' }}>{h.sent}/{h.recipient_count} sent</span>
                        {h.pending > 0 && <div style={{ color: 'var(--dp-ink-faint)' }}>{h.pending} sending…</div>}
                        {h.failed > 0 && (
                          <div>
                            <span style={{ color: 'var(--dp-danger)' }}>{h.failed} failed </span>
                            <button className="dp-btn" style={{ padding: '1px 6px', fontSize: 12.5 }} onClick={(e) => { e.stopPropagation(); retryFailed(); }}>Retry</button>
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
          <p style={{ fontSize: 13, color: 'var(--dp-ink-soft)', marginTop: 0 }}>
            {audienceLabel} · preview of the email to <b>{preview.emails.join(', ')}</b>:
          </p>
          <div style={{ border: '1px solid #EDEAE0', borderRadius: 8, padding: 14, fontSize: 13.5, lineHeight: 1.55 }}>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>{personalize(subject, preview)}</div>
            <div style={{ whiteSpace: 'pre-line' }}>{personalize(message, preview)}</div>
            {files.length > 0 && (
              <div style={{ borderTop: '1px solid #EDEAE0', marginTop: 12, paddingTop: 8, fontSize: 12.5, color: 'var(--dp-ink-soft)' }}>
                <Paperclip size={12} style={{ verticalAlign: -2 }} /> {files.length} attachment{files.length === 1 ? '' : 's'}: {files.map((f) => f.name).join(', ')}
              </div>
            )}
          </div>
        </Modal>
      )}
      </>)}
      {viewing && <MessagePreview item={viewing} onClose={() => setViewing(null)} onReuse={reuse} />}
    </>
  );
}
