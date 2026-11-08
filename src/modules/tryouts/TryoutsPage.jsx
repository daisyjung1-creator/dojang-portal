import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Check, Mail, Link2, MessageSquare } from 'lucide-react';
import { TRIAL_LINK, JOIN_LINK } from '../leads/LeadMessageModal';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import { TRYOUT_STATUSES } from '../../lib/constants';
import { todayISO } from '../../lib/billingDates';
import Field from '../../components/Field';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import EmailComposeModal from '../../components/EmailComposeModal';
import { fillTemplate, tryoutVars, timeLabel } from '../../lib/emailTemplates';

// Trials are usually at 4:30 pm (changeable in Invoice Settings).
function emptyForm(time = '16:30') {
  return { student_name: '', guardian_phone: '', guardian_email: '', class_name: '', date: todayISO(), time, status: 'Scheduled', notes: '' };
}

export default function TryoutsPage({ setActiveTab }) {
  const [tryouts, setTryouts] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [formError, setFormError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [settings, setSettings] = useState({});
  const [email, setEmail] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchTryouts();
    supabase.from('invoice_settings').select('*').eq('id', 1).maybeSingle().then(({ data }) => setSettings(data || {}));
  }, []);

  const defaultTime = (settings.default_tryout_time || '16:30').slice(0, 5);

  function openEmail(t) {
    const vars = tryoutVars(t, settings);
    setEmail({
      title: `Trial confirmation — ${t.student_name}`,
      type: 'tryout_confirmation',
      to: t.guardian_email || '',
      subject: fillTemplate(settings.tryout_subject || 'Trial class confirmed for {student}', vars),
      message: fillTemplate(settings.tryout_message || '', vars),
      payload: { tryout_id: t.id },
      note: t.confirmation_sent ? 'A confirmation was already sent for this booking.' : '',
      tryoutId: t.id,
    });
  }

  // Text confirmation (opens the phone's messages app; free, sent from your phone).
  function trialText(t) {
    const v = tryoutVars(t, settings);
    return `Hello, this is Master Daisy from ${v.business}. This confirms ${v.student}'s free trial class:\n${v.class} — ${v.date}, ${v.time}\n${v.address}\nPlease arrive 10 minutes early in comfortable clothes (t-shirt and track pants) and bring a water bottle. Ready to join after the trial? Register online: ${JOIN_LINK}`;
  }
  function smsHref(t) {
    const phone = String(t.guardian_phone || '').replace(/[^\d+]/g, '');
    return `sms:${phone}${/iPhone|iPad|Mac/i.test(navigator.userAgent) ? '&' : '?'}body=${encodeURIComponent(trialText(t))}`;
  }
  async function markTexted(t) {
    if (t.guardian_email || t.confirmation_sent) return;
    await supabase.from('tryouts').update({ confirmation_sent: true }).eq('id', t.id);
    setTryouts((prev) => prev.map((x) => (x.id === t.id ? { ...x, confirmation_sent: true } : x)));
  }

  async function fetchTryouts() {
    const { data } = await supabase.from('tryouts').select('*').order('date', { ascending: false });
    setTryouts(data || []);
  }

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm(defaultTime));
    setFormError('');
    setModalOpen(true);
  }

  function openEdit(t) {
    setEditingId(t.id);
    setForm({ ...emptyForm(), ...t });
    setFormError('');
    setModalOpen(true);
  }

  async function submitForm() {
    if (!form.student_name.trim()) {
      setFormError('Please enter a student name.');
      return;
    }
    let submitError;
    if (editingId) {
      ({ error: submitError } = await supabase.from('tryouts').update(form).eq('id', editingId));
    } else {
      const { data, error } = await supabase.from('tryouts').insert(form).select().single();
      submitError = error;
      // New booking with an email: show the confirmation to review and send.
      if (!error && data && (data.guardian_email || '').trim()) {
        setModalOpen(false);
        fetchTryouts();
        openEmail(data);
        return;
      }
    }
    if (submitError) {
      setFormError('Could not save: ' + submitError.message);
      return;
    }
    setModalOpen(false);
    fetchTryouts();
  }

  async function confirmDelete(id) {
    await supabase.from('tryouts').delete().eq('id', id);
    setConfirmDeleteId(null);
    fetchTryouts();
  }

  async function setStatus(id, status) {
    const { data } = await supabase.from('tryouts').update({ status }).eq('id', id).select();
    if (data) setTryouts((prev) => prev.map((t) => (t.id === id ? data[0] : t)));
  }

  async function convertToRegistration(t) {
    await setStatus(t.id, 'Converted');
    sessionStorage.setItem('registerDraft', JSON.stringify({ name: t.student_name, guardian_phone: t.guardian_phone, guardian_email: t.guardian_email, class_name: t.class_name }));
    setActiveTab('register');
  }

  const filtered = useMemo(() => tryouts.filter((t) => statusFilter === 'all' || t.status === statusFilter), [tryouts, statusFilter]);
  const statusMeta = (status) => TRYOUT_STATUSES.find((s) => s.value === status) || TRYOUT_STATUSES[0];

  return (
    <>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Trials</h1>
          <p style={styles.subtitle}>{tryouts.length} trial bookings</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="dp-btn" title={TRIAL_LINK} onClick={async () => { try { await navigator.clipboard.writeText(TRIAL_LINK); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { window.prompt('Copy this link:', TRIAL_LINK); } }}>
            {copied ? <Check size={15} /> : <Link2 size={15} />} {copied ? 'Copied' : 'Copy booking link'}
          </button>
          <button className="dp-btn dp-btn-primary" onClick={openAdd}>
            <Plus size={15} /> Add Booking
          </button>
        </div>
      </div>
      <p style={{ fontSize: 12.5, color: '#8A8D84', margin: '-6px 0 12px' }}>
        Families can book a free trial themselves at {TRIAL_LINK} — up to {settings.trial_capacity ?? 3} trials per class, next {settings.trial_days_ahead ?? 21} days. Online bookings show here as “Booked online” and in Leads.
      </p>

      <div style={styles.filterBar}>
        <select className="dp-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All Statuses</option>
          {TRYOUT_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.value}
            </option>
          ))}
        </select>
      </div>

      <div style={styles.card}>
        {filtered.length === 0 ? (
          <p style={{ padding: 20, color: '#5B5F56', fontSize: 14 }}>No bookings.</p>
        ) : (
          <table className="dp-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Phone</th>
                <th>Interested Class</th>
                <th>Date</th>
                <th>Time</th>
                <th>Confirmation</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const meta = statusMeta(t.status);
                return (
                  <tr key={t.id} className="dp-row">
                    <td style={{ fontWeight: 500 }}>{t.student_name}</td>
                    <td>{t.guardian_phone || '—'}</td>
                    <td>{t.class_name || '—'}</td>
                    <td>{t.date || '—'}</td>
                    <td>{timeLabel(t.time) || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'nowrap' }}>
                        {t.guardian_email && (
                          <button className="dp-btn" style={{ padding: '3px 8px', fontSize: 12 }} onClick={() => openEmail(t)}>
                            <Mail size={12} /> {t.confirmation_sent ? 'Sent ✓' : 'Send'}
                          </button>
                        )}
                        {t.guardian_phone && (
                          <a
                            className="dp-btn"
                            style={{ padding: '3px 8px', fontSize: 12, textDecoration: 'none', ...(!t.guardian_email && !t.confirmation_sent ? { background: '#BF1C21', color: '#fff', borderColor: '#BF1C21' } : {}) }}
                            href={smsHref(t)}
                            title="Opens your phone's messages with the confirmation written"
                            onClick={() => markTexted(t)}
                          >
                            <MessageSquare size={12} /> {!t.guardian_email && t.confirmation_sent ? 'Texted ✓' : 'Text'}
                          </a>
                        )}
                        {!t.guardian_email && !t.guardian_phone && <span style={{ fontSize: 12.5, color: '#8A8D84' }}>No contact</span>}
                      </div>
                    </td>
                    <td>
                      <select
                        className="dp-select"
                        style={{ fontSize: 12.5, padding: '3px 6px', background: meta.bg, color: meta.text, borderColor: meta.border }}
                        value={t.status}
                        onChange={(e) => setStatus(t.id, e.target.value)}
                      >
                        {TRYOUT_STATUSES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.value}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {t.status !== 'Converted' && (
                          <button className="dp-btn" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => convertToRegistration(t)}>
                            To Enrollment
                          </button>
                        )}
                        <button aria-label="Edit" className="dp-btn" style={{ padding: 6 }} onClick={() => openEdit(t)}>
                          <Pencil size={14} />
                        </button>
                        <button aria-label="Delete" className="dp-btn dp-btn-danger" style={{ padding: 6 }} onClick={() => setConfirmDeleteId(t.id)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <Modal
          title={editingId ? 'Edit Trial Booking' : 'Add Trial Booking'}
          onClose={() => setModalOpen(false)}
          footer={
            <>
              <button className="dp-btn" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button className="dp-btn dp-btn-primary" onClick={submitForm}>
                <Check size={15} /> Save
              </button>
            </>
          }
        >
          <Field label="Student Name" required>
            <input className="dp-input" style={{ width: '100%' }} value={form.student_name} onChange={(e) => setForm({ ...form, student_name: e.target.value })} />
          </Field>
          <Field label="Guardian Phone">
            <input className="dp-input" style={{ width: '100%' }} value={form.guardian_phone || ''} onChange={(e) => setForm({ ...form, guardian_phone: e.target.value })} />
          </Field>
          <Field label="Guardian Email">
            <input type="email" className="dp-input" style={{ width: '100%' }} value={form.guardian_email || ''} onChange={(e) => setForm({ ...form, guardian_email: e.target.value })} />
          </Field>
          <div style={styles.formRow}>
            <Field label="Interested Class">
              <input className="dp-input" style={{ width: '100%' }} value={form.class_name || ''} onChange={(e) => setForm({ ...form, class_name: e.target.value })} />
            </Field>
            <Field label="Status">
              <select className="dp-select" style={{ width: '100%' }} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {TRYOUT_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.value}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div style={styles.formRow}>
            <Field label="Booking Date">
              <input type="date" className="dp-input" style={{ width: '100%' }} value={form.date || ''} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </Field>
            <Field label="Booking Time">
              <input type="time" className="dp-input" style={{ width: '100%' }} value={form.time || ''} onChange={(e) => setForm({ ...form, time: e.target.value })} />
            </Field>
          </div>
          <Field label="Notes">
            <textarea className="dp-input" style={{ width: '100%', minHeight: 60, resize: 'vertical' }} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          {formError && <p style={{ color: '#9A2B2B', fontSize: 13, margin: '4px 0 0' }}>{formError}</p>}
        </Modal>
      )}

      {email && (
        <EmailComposeModal
          draft={email}
          onClose={() => setEmail(null)}
          onSent={async () => {
            await supabase.from('tryouts').update({ confirmation_sent: true }).eq('id', email.tryoutId);
            setEmail(null);
            fetchTryouts();
          }}
        />
      )}

      {confirmDeleteId && <ConfirmDialog message="Delete this booking? This can't be undone." onCancel={() => setConfirmDeleteId(null)} onConfirm={() => confirmDelete(confirmDeleteId)} />}
    </>
  );
}
