import StudentFlags from '../../components/StudentFlags';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Search, Plus, Upload, Pencil, Trash2, Check, AlertTriangle, Mail, CalendarX } from 'lucide-react';
import CancellationModal from './CancellationModal';
import { REREGISTRATION_FEE } from '../../lib/tuitionBilling';
import { fillSubsidyTemplate, DEFAULT_SUBSIDY_SUBJECT } from '../../lib/subsidyReminder';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import { BELTS } from '../../lib/constants';
import { PLANS, billingAnchor, currentCycleStart, nextDueDate, todayISO, daysUntil } from '../../lib/billingDates';
import Field from '../../components/Field';
import ClassPicker from '../../components/ClassPicker';
import ClassDaysPicker from '../../components/ClassDaysPicker';
import { clearOffDayAbsences } from '../../lib/classDays';
import WelcomeEmailModal from '../../components/WelcomeEmailModal';
import { allClassNames } from '../../lib/classes';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useAuth } from '../../auth/AuthContext';

const FIELD_DEFS = [
  { key: 'name', label: 'Name', required: true, aliases: ['name', 'student name'] },
  { key: 'dob', label: 'Date of Birth', aliases: ['dob', 'birth', 'birthday'] },
  { key: 'guardian_name', label: 'Guardian Name', aliases: ['guardian', 'guardian name', 'parent'] },
  { key: 'guardian_phone', label: 'Guardian Phone', aliases: ['phone', 'guardian phone', 'contact'] },
  { key: 'guardian_email', label: 'Guardian Email(s)', aliases: ['email', 'guardian email'] },
  { key: 'address', label: 'Address', aliases: ['address', 'street'] },
  { key: 'emergency_name', label: 'Emergency Contact', aliases: ['emergency contact', 'emergency name'] },
  { key: 'emergency_phone', label: 'Emergency Phone', aliases: ['emergency phone', 'emergency'] },
  { key: 'belt', label: 'Belt', aliases: ['belt', 'rank'] },
  { key: 'class_name', label: 'Class', aliases: ['class', 'class name'] },
  { key: 'tuition', label: 'Monthly Tuition', aliases: ['tuition', 'monthly tuition', 'fee'] },
  { key: 'enroll_date', label: 'Enrollment Date', aliases: ['enroll', 'enrollment date', 'join date'] },
  { key: 'notes', label: 'Notes', aliases: ['notes', 'memo'] },
];

function emptyForm() {
  return { name: '', dob: '', guardian_name: '', guardian_phone: '', guardian_email: '', address: '', emergency_name: '', emergency_phone: '', belt: 'White', class_name: '', tuition: '', enroll_date: '', billing_start_date: '', plan: '1 Month', subsidy: false, subsidy_name: '', subsidy_amount: '', subsidy_end_date: '', classes_per_week: '', class_days: null, family_discount: false, billing_exempt: false, medical: '', photo_consent: null, notes: '' };
}

// Several guardian emails can be stored together, separated by commas.
export function splitEmails(v) {
  return String(v || '')
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter(Boolean);
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Subsidies ending within this many days get flagged.
const SUBSIDY_WARN_DAYS = 60;

function guessMapping(headers) {
  const mapping = {};
  FIELD_DEFS.forEach((f) => {
    const idx = headers.findIndex((h) => f.aliases.some((a) => String(h).trim().toLowerCase().includes(a.toLowerCase())));
    mapping[f.key] = idx >= 0 ? idx : -1;
  });
  return mapping;
}

export default function StudentsPage() {
  const { isAdmin } = useAuth();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [beltFilter, setBeltFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('active');
  const [cancelFor, setCancelFor] = useState(null);
  const [reactivateFor, setReactivateFor] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [formError, setFormError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [importState, setImportState] = useState(null);
  const [reminder, setReminder] = useState(null);
  const [endingId, setEndingId] = useState(null); // subsidy waiting for "Confirm"
  const [welcomeFor, setWelcomeFor] = useState(null);
  const [families, setFamilies] = useState({}); // customer id → { name, payment_type } // { student, subject, message, to, error, sending }
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchStudents();
    const draft = sessionStorage.getItem('studentDraft');
    if (draft) {
      setForm({ ...emptyForm(), ...JSON.parse(draft) });
      setEditingId(null);
      setFormError('');
      setModalOpen(true);
      sessionStorage.removeItem('studentDraft');
    }
  }, []);

  async function fetchStudents() {
    setLoading(true);
    const [{ data, error: fetchError }, { data: fams }, { data: credits }] = await Promise.all([
      supabase.from('students').select('*').order('name'),
      supabase.from('customers').select('id, name, payment_type'),
      supabase.from('customer_credit').select('customer_id, credit').neq('credit', 0),
    ]);
    if (fetchError) setError('Could not load the student list.');
    else setStudents(data || []);
    const creditBy = Object.fromEntries((credits || []).map((r) => [r.customer_id, Number(r.credit)]));
    setFamilies(Object.fromEntries((fams || []).map((c) => [c.id, { ...c, credit: creditBy[c.id] || 0 }])));
    setLoading(false);
  }

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm());
    setFormError('');
    setModalOpen(true);
  }

  function openEdit(student) {
    setEditingId(student.id);
    const f = { ...emptyForm(), ...student, payment_type: families[student.customer_id]?.payment_type || 'preauth' };
    Object.keys(f).forEach((k) => f[k] === null && (f[k] = ''));
    setForm(f);
    setFormError('');
    setModalOpen(true);
  }

  async function submitForm() {
    if (!form.name.trim()) {
      setFormError('Please enter a name.');
      return;
    }
    const emails = splitEmails(form.guardian_email);
    const bad = emails.filter((e) => !EMAIL_RE.test(e));
    if (bad.length) {
      setFormError('These emails don’t look right: ' + bad.join(', '));
      return;
    }
    if (form.subsidy && !form.subsidy_end_date) {
      setFormError('Please enter when the subsidy ends.');
      return;
    }
    const blank = (v) => (v === '' || v === undefined ? null : v);
    // Empty form fields are saved as "nothing" (null), not as an empty string —
    // the database rejects "" for ids, dates and numbers.
    const cleaned = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === '' ? null : v]));
    delete cleaned.id;
    delete cleaned.created_at;
    delete cleaned.customer_id; // the family link is managed by the database
    delete cleaned.payment_type; // stored on the family (customer)
    const payload = {
      ...cleaned,
      name: form.name.trim(),
      guardian_email: emails.join(', ') || null,
      dob: blank(form.dob),
      enroll_date: blank(form.enroll_date),
      // Same as the enrollment date unless set differently.
      billing_start_date: form.billing_start_date && form.billing_start_date !== form.enroll_date ? form.billing_start_date : null,
      tuition: form.tuition === '' ? null : Number(form.tuition),
      subsidy: !!form.subsidy,
      classes_per_week: form.classes_per_week === '' || form.classes_per_week == null ? null : Number(form.classes_per_week),
      class_days: form.class_days && form.class_days.length ? form.class_days : null,
      family_discount: !!form.family_discount,
      billing_exempt: !!form.billing_exempt,
      subsidy_name: form.subsidy ? blank(form.subsidy_name) : null,
      subsidy_amount: form.subsidy && form.subsidy_amount !== '' ? Number(form.subsidy_amount) : null,
      subsidy_end_date: form.subsidy ? blank(form.subsidy_end_date) : null,
    };
    let submitError;
    if (editingId) {
      ({ error: submitError } = await supabase.from('students').update(payload).eq('id', editingId));
      if (!submitError && payload.class_days) await clearOffDayAbsences(editingId, payload.class_days);
      const fam = form.customer_id && families[form.customer_id];
      if (!submitError && fam && fam.payment_type !== form.payment_type) {
        await supabase.from('customers').update({ payment_type: form.payment_type }).eq('id', form.customer_id);
      }
    } else {
      ({ error: submitError } = await supabase.from('students').insert(payload));
    }
    if (submitError) {
      setFormError('Could not save: ' + submitError.message);
      return;
    }
    setModalOpen(false);
    fetchStudents();
  }

  async function confirmDelete(id) {
    await supabase.from('students').delete().eq('id', id);
    setConfirmDeleteId(null);
    fetchStudents();
  }

  async function setStudentStatus(id, status, extra = {}) {
    const payload = { ...(status === 'withdrawn' ? { status, withdrawn_date: new Date().toISOString().slice(0, 10) } : { status, withdrawn_date: null, billing_end_date: null }), ...extra };
    const { data } = await supabase.from('students').update(payload).eq('id', id).select();
    if (data) setStudents((prev) => prev.map((s) => (s.id === id ? data[0] : s)));
  }

  // Subsidy is over: untick it so the alert goes away and billing stops
  // taking it off. The grant name / amount / end date are kept for reference.
  async function endSubsidy(s) {
    const { error: e } = await supabase.from('students').update({ subsidy: false }).eq('id', s.id);
    setEndingId(null);
    if (e) return setError('Could not update: ' + e.message);
    setStudents((prev) => prev.map((x) => (x.id === s.id ? { ...x, subsidy: false } : x)));
  }

  async function openReminder(s) {
    const { data: st } = await supabase.from('invoice_settings').select('business_name, subsidy_reminder_subject, subsidy_reminder_message').eq('id', 1).maybeSingle();
    setReminder({
      student: s,
      to: s.guardian_email || '',
      subject: fillSubsidyTemplate(st?.subsidy_reminder_subject || DEFAULT_SUBSIDY_SUBJECT, s, st || {}),
      message: fillSubsidyTemplate(st?.subsidy_reminder_message || '', s, st || {}),
      error: '',
    });
  }

  async function sendReminder() {
    const emails = splitEmails(reminder.to);
    if (!emails.length || emails.some((e) => !EMAIL_RE.test(e))) return setReminder({ ...reminder, error: 'Enter a valid email address.' });
    if (!reminder.message.trim()) return setReminder({ ...reminder, error: 'The message is empty — set the template in Invoice Settings.' });
    setReminder({ ...reminder, sending: true, error: '' });
    const { error: e1 } = await supabase.from('email_queue').insert({
      type: 'subsidy_reminder',
      student_id: reminder.student.id,
      recipient_email: emails.join(', '),
      payload: { student_id: reminder.student.id, subject: reminder.subject, message: reminder.message },
    });
    if (e1) return setReminder({ ...reminder, sending: false, error: 'Could not send: ' + e1.message });
    const at = new Date().toISOString();
    await supabase.from('students').update({ subsidy_reminded_at: at }).eq('id', reminder.student.id);
    setStudents((prev) => prev.map((x) => (x.id === reminder.student.id ? { ...x, subsidy_reminded_at: at } : x)));
    setReminder(null);
  }

  const subsidyAlerts = useMemo(
    () =>
      students
        .filter((s) => s.status !== 'withdrawn' && s.subsidy && s.subsidy_end_date && daysUntil(s.subsidy_end_date) <= SUBSIDY_WARN_DAYS)
        .map((s) => ({ ...s, days: daysUntil(s.subsidy_end_date) }))
        .sort((a, b) => a.days - b.days),
    [students]
  );

  const classes = useMemo(() => allClassNames(students), [students]);

  // Students in the same family (customer), for the "Siblings" line.
  const siblingsBy = useMemo(() => {
    const m = {};
    students.forEach((x) => x.customer_id && x.status !== 'withdrawn' && (m[x.customer_id] ||= []).push(x));
    return m;
  }, [students]);
  const filtered = useMemo(() => {
    return students.filter((s) => {
      const matchesSearch =
        !search.trim() ||
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        (s.guardian_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (s.class_name || '').toLowerCase().includes(search.toLowerCase());
      const matchesBelt = beltFilter === 'all' || s.belt === beltFilter;
      const matchesStatus = statusFilter === 'all' || (s.status || 'active') === statusFilter;
      return matchesSearch && matchesBelt && matchesStatus;
    });
  }, [students, search, beltFilter, statusFilter]);

  function beltMeta(belt) {
    return BELTS.find((b) => b.value === belt) || BELTS[0];
  }

  function handleFileSelect(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
        if (!rows.length) {
          setImportState({ error: 'No data could be read from this file.' });
          return;
        }
        const headers = rows[0];
        const dataRows = rows.slice(1).filter((r) => r.some((cell) => String(cell).trim() !== ''));
        const mapping = guessMapping(headers);
        setImportState({ headers, dataRows, mapping });
      } catch (err) {
        setImportState({ error: 'There was a problem reading this file. Please check the format.' });
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }

  function updateImportMapping(fieldKey, colIndex) {
    setImportState((prev) => ({ ...prev, mapping: { ...prev.mapping, [fieldKey]: colIndex } }));
  }

  async function confirmImport() {
    if (!importState || !importState.dataRows) return;
    const nameIdx = importState.mapping.name;
    if (nameIdx === -1 || nameIdx === undefined) {
      setImportState((prev) => ({ ...prev, error: 'Please choose which column is the name.' }));
      return;
    }
    const imported = importState.dataRows
      .map((row) => {
        const rec = emptyForm();
        FIELD_DEFS.forEach((f) => {
          const idx = importState.mapping[f.key];
          if (idx !== -1 && idx !== undefined && row[idx] !== undefined) {
            rec[f.key] = String(row[idx]).trim();
          }
        });
        if (!BELTS.some((b) => b.value === rec.belt)) rec.belt = 'White';
        rec.guardian_email = splitEmails(rec.guardian_email).join(', ') || null;
        ['dob', 'enroll_date', 'billing_start_date', 'subsidy_end_date', 'subsidy_amount', 'subsidy_name'].forEach((k) => rec[k] === '' && (rec[k] = null));
        rec.tuition = rec.tuition === '' ? null : Number(rec.tuition);
        return rec;
      })
      .filter((r) => r.name);
    const { error } = await supabase.from('students').insert(imported);
    if (!error) {
      setImportState(null);
      fetchStudents();
    } else {
      setImportState((prev) => ({ ...prev, error: 'Import failed: ' + error.message }));
    }
  }

  return (
    <>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Students</h1>
          <p style={styles.subtitle}>{students.length} registered</p>
        </div>
        {isAdmin && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="dp-btn" onClick={() => fileInputRef.current.click()}>
              <Upload size={15} /> Upload Excel
            </button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleFileSelect} />
            <button className="dp-btn dp-btn-primary" onClick={openAdd}>
              <Plus size={15} /> Add Student
            </button>
          </div>
        )}
      </div>

      <div style={styles.filterBar}>
        <div style={styles.searchBox}>
          <Search size={15} color="#5B5F56" />
          <input
            className="dp-input"
            style={{ border: 'none', flex: 1, padding: '4px 6px' }}
            placeholder="Search by name, guardian, or class"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="dp-select" value={beltFilter} onChange={(e) => setBeltFilter(e.target.value)}>
          <option value="all">All Belts</option>
          {BELTS.map((b) => (
            <option key={b.value} value={b.value}>
              {b.value}
            </option>
          ))}
        </select>
        <select className="dp-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="active">Active</option>
          <option value="withdrawn">Withdrawn</option>
          <option value="all">All</option>
        </select>
      </div>

      {error && <p style={{ color: '#9A2B2B', fontSize: 13 }}>{error}</p>}

      {isAdmin && subsidyAlerts.length > 0 && (
        <div style={{ background: '#FAEEDA', border: '1px solid #F0D9A8', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#5C3A07' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, marginBottom: 4 }}>
            <AlertTriangle size={14} /> Subsidies ending soon ({subsidyAlerts.length})
          </div>
          {subsidyAlerts.map((s) => (
            <div key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '2px 0' }}>
              <button className="dp-btn" style={{ padding: '1px 8px', fontSize: 12 }} onClick={() => openEdit(s)}>{s.name}</button>
              <span>
                {s.subsidy_name || 'Subsidy'}
                {s.subsidy_amount ? ` ($${Number(s.subsidy_amount).toFixed(2)}/mo)` : ''}{' '}
                {s.days < 0 ? <b>ended {-s.days} days ago ({s.subsidy_end_date})</b> : s.days === 0 ? <b>ends today</b> : <>ends in <b>{s.days} days</b> ({s.subsidy_end_date})</>}
              </span>
              <button className="dp-btn" style={{ padding: '1px 8px', fontSize: 12, marginLeft: 'auto' }} disabled={!s.guardian_email} title={s.guardian_email ? '' : 'No guardian email'} onClick={() => openReminder(s)}>
                <Mail size={12} /> Email reminder
              </button>
              {s.subsidy_reminded_at && <span style={{ fontSize: 12, color: '#2A5A30', whiteSpace: 'nowrap' }}>✓ sent {new Date(s.subsidy_reminded_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}</span>}
              {endingId === s.id ? (
                <span style={{ display: 'flex', gap: 4, whiteSpace: 'nowrap' }}>
                  <button className="dp-btn dp-btn-primary" style={{ padding: '1px 8px', fontSize: 12 }} onClick={() => endSubsidy(s)}>Confirm — stop subsidy</button>
                  <button className="dp-btn" style={{ padding: '1px 8px', fontSize: 12 }} onClick={() => setEndingId(null)}>Cancel</button>
                </span>
              ) : (
                <button className="dp-btn" style={{ padding: '1px 8px', fontSize: 12, whiteSpace: 'nowrap' }} title="The subsidy is over: untick Subsidy for this student and remove this alert" onClick={() => setEndingId(s.id)}>
                  <Check size={12} /> Subsidy ended
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={styles.card}>
        {loading ? (
          <p style={{ padding: 20, color: '#5B5F56', fontSize: 14 }}>Loading...</p>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <p style={{ color: '#20241F', fontSize: 15, margin: '0 0 4px' }}>
              {students.length === 0 ? 'No students yet.' : 'No matching results.'}
            </p>
          </div>
        ) : (
          <table className="dp-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Belt</th>
                <th>Class</th>
                <th>Guardian</th>
                <th>Phone</th>
                <th>Plan</th>
                <th>Next billing</th>
                {isAdmin && <th style={{ width: 160 }}></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const belt = beltMeta(s.belt);
                const sibs = s.customer_id ? (siblingsBy[s.customer_id] || []).filter((x) => x.id !== s.id) : [];
                return (
                  <tr key={s.id} className="dp-row">
                    <td style={{ fontWeight: 500 }}>
                      {s.name}
                      <StudentFlags s={s} style={{ marginLeft: 6 }} />
                      {s.status === 'withdrawn' && (
                        <span style={{ marginLeft: 6, fontSize: 10.5, color: '#5B5F56', border: '1px solid #DEDACC', borderRadius: 999, padding: '1px 6px' }}>Withdrawn</span>
                      )}
                      {sibs.length > 0 && (
                        <div style={{ fontSize: 11.5, fontWeight: 400, color: '#8A8D84' }} title={`Same family: ${families[s.customer_id]?.name || ''}`}>
                          Sibling{sibs.length > 1 ? 's' : ''}: {sibs.map((x) => x.name.split(' ')[0]).join(', ')}
                        </div>
                      )}
                    </td>
                    <td>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '3px 9px',
                          borderRadius: 999,
                          fontSize: 12.5,
                          background: belt.bg,
                          color: belt.text,
                          border: `1px solid ${belt.border}`,
                        }}
                      >
                        {s.belt}
                      </span>
                    </td>
                    <td>{s.class_name || '—'}</td>
                    <td>{s.guardian_name || '—'}</td>
                    <td>{s.guardian_phone || '—'}</td>
                    <td>
                      {s.billing_exempt ? <Badge c={['#1E4566', '#E6F0F6', '#B9D3E4']}>Staff · no invoice</Badge> : s.plan || '1 Month'}
                      {families[s.customer_id]?.payment_type === 'manual' && !s.billing_exempt && <Badge c={['#1E4566', '#E6F0F6', '#B9D3E4']} title="Pays manually (debit / cash)">Manual pay</Badge>}
                      {s.classes_per_week ? <Badge c={['#5B5F56', '#F1EFE7', '#DEDACC']}>{s.classes_per_week}x/wk</Badge> : null}
                      {s.family_discount && <Badge c={['#4B3A86', '#EEEAF6', '#D2C9EA']} title="Big family discount">Family -20%</Badge>}
                      {families[s.customer_id]?.credit > 0.004 && <Badge c={['#2A5A30', '#E8F1E9', '#BFDCC3']} title="Family account credit — used on the next invoice">Credit ${Number(families[s.customer_id].credit).toFixed(2)}</Badge>}
                      {s.subsidy && <span title={`${s.subsidy_name || 'Subsidy'} until ${s.subsidy_end_date || '?'}`} style={{ marginLeft: 6, fontSize: 10.5, color: '#2A5A30', border: '1px solid #BFDCC3', background: '#E8F1E9', borderRadius: 999, padding: '1px 6px' }}>Subsidy</span>}
                    </td>
                    <td>
                      {s.billing_end_date && nextDueDate(s, todayISO()) > s.billing_end_date ? <span style={{ color: '#9A2B2B', fontSize: 12.5 }}>Ends {s.billing_end_date}</span> : billingAnchor(s) ? nextDueDate(s, todayISO()) : '—'}
                      {s.reregistration_fee_due && <div style={{ fontSize: 11, color: '#854F0B' }}>+ re-registration fee</div>}
                    </td>
                    {isAdmin && (
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            className="dp-btn"
                            style={{ padding: '4px 8px', fontSize: 12 }}
                            onClick={() => (s.status === 'withdrawn' ? setReactivateFor(s) : setStudentStatus(s.id, 'withdrawn'))}
                          >
                            {s.status === 'withdrawn' ? 'Reactivate' : 'Withdraw'}
                          </button>
                          {s.status !== 'withdrawn' && (
                            <button aria-label="Membership cancellation" title="Membership cancellation (email request, 14-day rule)" className="dp-btn" style={{ padding: 6, ...(s.billing_end_date ? { color: '#9A2B2B', borderColor: '#E4B8B8' } : {}) }} onClick={() => setCancelFor(s)}>
                              <CalendarX size={14} />
                            </button>
                          )}
                          <button aria-label="Edit" className="dp-btn" style={{ padding: 6 }} onClick={() => openEdit(s)}>
                            <Pencil size={14} />
                          </button>
                          <button aria-label="Delete" className="dp-btn dp-btn-danger" style={{ padding: 6 }} onClick={() => setConfirmDeleteId(s.id)}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <Modal
          title={editingId ? 'Edit Student' : 'Add Student'}
          onClose={() => setModalOpen(false)}
          footer={
            <>
              {editingId && isAdmin && (
                <button
                  className="dp-btn"
                  style={{ marginRight: 'auto' }}
                  disabled={!form.guardian_email}
                  title={form.guardian_email ? 'Uses the saved student details' : 'No guardian email'}
                  onClick={() => {
                    const st = students.find((x) => x.id === editingId);
                    setModalOpen(false);
                    setWelcomeFor(st);
                  }}
                >
                  <Mail size={14} /> Welcome email{students.find((x) => x.id === editingId)?.welcome_sent_at ? ' ✓' : ''}
                </button>
              )}
              <button className="dp-btn" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button className="dp-btn dp-btn-primary" onClick={submitForm}>
                <Check size={15} /> Save
              </button>
            </>
          }
        >
          <Field label="Name" required>
            <input className="dp-input" style={{ width: '100%' }} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          {editingId && form.customer_id && (siblingsBy[form.customer_id] || []).some((x) => x.id !== editingId) && (
            <p style={{ fontSize: 12.5, color: '#5B5F56', margin: '-6px 0 12px' }}>
              Family <b>{families[form.customer_id]?.name}</b> · siblings:{' '}
              {(siblingsBy[form.customer_id] || []).filter((x) => x.id !== editingId).map((x, i) => (
                <React.Fragment key={x.id}>
                  {i > 0 && ', '}
                  <button type="button" style={{ border: 'none', background: 'none', padding: 0, color: '#1E4566', textDecoration: 'underline', cursor: 'pointer', fontSize: 12.5 }} onClick={() => openEdit(x)}>{x.name}</button>
                </React.Fragment>
              ))}
              <span style={{ color: '#8A8D84' }}> (change in Customers)</span>
            </p>
          )}
          <Field label="Date of Birth">
            <input type="date" className="dp-input" style={{ width: '100%' }} value={form.dob || ''} onChange={(e) => setForm({ ...form, dob: e.target.value })} />
          </Field>
          <div style={styles.formRow}>
            <Field label="Belt">
              <select className="dp-select" style={{ width: '100%' }} value={form.belt} onChange={(e) => setForm({ ...form, belt: e.target.value })}>
                {BELTS.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.value}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div style={{ marginBottom: 12 }}>
            <span style={{ display: 'block', fontSize: 12.5, color: '#5B5F56', marginBottom: 4 }}>Classes (pick all that apply)</span>
            <ClassPicker value={form.class_name || ''} onChange={(v) => setForm({ ...form, class_name: v })} options={classes} />
          </div>
          <ClassDaysPicker classNames={form.class_name} perWeek={form.classes_per_week} value={form.class_days} onChange={(v) => setForm({ ...form, class_days: v })} />
          <div style={styles.formRow}>
            <Field label="Guardian Name">
              <input className="dp-input" style={{ width: '100%' }} value={form.guardian_name || ''} onChange={(e) => setForm({ ...form, guardian_name: e.target.value })} />
            </Field>
            <Field label="Guardian Phone">
              <input className="dp-input" style={{ width: '100%' }} value={form.guardian_phone || ''} onChange={(e) => setForm({ ...form, guardian_phone: e.target.value })} />
            </Field>
          </div>
          <Field label="Guardian Email(s) — separate with commas; invoices go to all">
            <input className="dp-input" style={{ width: '100%' }} placeholder="mom@example.com, dad@example.com" value={form.guardian_email || ''} onChange={(e) => setForm({ ...form, guardian_email: e.target.value })} />
          </Field>
          <Field label="Address">
            <textarea className="dp-input" rows={2} style={{ width: '100%', resize: 'vertical' }} value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </Field>
          <div style={styles.formRow}>
            <Field label="Emergency Contact Name">
              <input className="dp-input" style={{ width: '100%' }} value={form.emergency_name || ''} onChange={(e) => setForm({ ...form, emergency_name: e.target.value })} />
            </Field>
            <Field label="Emergency Phone">
              <input className="dp-input" style={{ width: '100%' }} value={form.emergency_phone || ''} onChange={(e) => setForm({ ...form, emergency_phone: e.target.value })} />
            </Field>
          </div>

          <SectionLabel>Billing</SectionLabel>
          <div style={styles.formRow}>
            <Field label="Enrollment Date">
              <input
                type="date"
                className="dp-input"
                style={{ width: '100%' }}
                value={form.enroll_date || ''}
                onChange={(e) => setForm({ ...form, enroll_date: e.target.value, billing_start_date: form.billing_start_date && form.billing_start_date !== form.enroll_date ? form.billing_start_date : '' })}
              />
            </Field>
            <Field label="Billing Starts (default: enrollment date)">
              <input type="date" className="dp-input" style={{ width: '100%' }} value={form.billing_start_date || form.enroll_date || ''} onChange={(e) => setForm({ ...form, billing_start_date: e.target.value })} />
            </Field>
          </div>
          <div style={styles.formRow}>
            <Field label="Plan">
              <select className="dp-select" style={{ width: '100%' }} value={form.plan || '1 Month'} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
                {PLANS.map((p) => <option key={p.value}>{p.value}</option>)}
              </select>
            </Field>
            <Field label={form.plan === '3 Months' ? 'Tuition per 3 months ($)' : 'Monthly Tuition ($)'}>
              <input type="number" className="dp-input" style={{ width: '100%' }} value={form.tuition ?? ''} onChange={(e) => setForm({ ...form, tuition: e.target.value })} />
            </Field>
          </div>
          <div style={styles.formRow}>
            <Field label="Classes per week">
              <select
                className="dp-select"
                style={{ width: '100%' }}
                value={form.classes_per_week ?? ''}
                onChange={(e) => {
                  const n = e.target.value === '' ? '' : Number(e.target.value);
                  setForm({ ...form, classes_per_week: n, tuition: form.tuition === '' || form.tuition == null ? suggestedTuition(n, form.plan) : form.tuition });
                }}
              >
                <option value="">—</option>
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} × per week</option>)}
              </select>
            </Field>
            <div style={{ flex: 1 }} />
          </div>
          {(form.billing_start_date || form.enroll_date) && (
            <p style={{ fontSize: 12.5, color: '#5B5F56', margin: '-4px 0 12px' }}>
              Bills every {form.plan === '3 Months' ? '3 months' : 'month'} · current cycle started {currentCycleStart(form, todayISO())} · next billing {nextDueDate(form, todayISO())}
            </p>
          )}

          {editingId && form.customer_id && (
            <Field label={`How the family pays (${families[form.customer_id]?.name || 'family'})`}>
              <select className="dp-select" style={{ width: '100%' }} value={form.payment_type || 'preauth'} onChange={(e) => setForm({ ...form, payment_type: e.target.value })}>
                <option value="preauth">Pre-authorized credit card</option>
                <option value="manual">Pays manually — debit / cash (gets invoice + reminder)</option>
              </select>
            </Field>
          )}
          {form.customer_id && families[form.customer_id]?.credit > 0.004 && (
            <p style={{ background: '#E8F1E9', color: '#2A5A30', border: '1px solid #BFDCC3', borderRadius: 6, padding: '7px 10px', fontSize: 13, margin: '0 0 12px' }}>
              Family credit: <b>${Number(families[form.customer_id].credit).toFixed(2)}</b> — taken off the family’s next invoice automatically (from overpayments).
            </p>
          )}
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, marginBottom: 8 }}>
            <input type="checkbox" checked={!!form.family_discount} onChange={(e) => setForm({ ...form, family_discount: e.target.checked })} />
            Big family discount (20% off tuition — taken off automatically on Billing invoices)
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, marginBottom: 8 }}>
            <input type="checkbox" checked={!!form.billing_exempt} onChange={(e) => setForm({ ...form, billing_exempt: e.target.checked })} />
            Coach / instructor — doesn't pay, never invoiced
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, marginBottom: 10 }}>
            <input type="checkbox" checked={!!form.subsidy} onChange={(e) => setForm({ ...form, subsidy: e.target.checked })} />
            Receives a subsidy (KidSport etc.)
          </label>
          {form.subsidy && (
            <div style={{ background: '#FAF8F2', border: '1px solid #EDEAE0', borderRadius: 8, padding: '12px 12px 0', marginBottom: 12 }}>
              <div style={styles.formRow}>
                <Field label="Subsidy">
                  <input className="dp-input" style={{ width: '100%' }} list="subsidy-options" placeholder="KidSport" value={form.subsidy_name || ''} onChange={(e) => setForm({ ...form, subsidy_name: e.target.value })} />
                  <datalist id="subsidy-options">
                    {Array.from(new Set(['KidSport', ...students.map((s) => s.subsidy_name).filter(Boolean)])).map((n) => <option key={n} value={n} />)}
                  </datalist>
                </Field>
                <Field label="Amount / month ($)">
                  <input type="number" className="dp-input" style={{ width: '100%' }} value={form.subsidy_amount ?? ''} onChange={(e) => setForm({ ...form, subsidy_amount: e.target.value })} />
                </Field>
              </div>
              <Field label="Subsidy ends" required>
                <input type="date" className="dp-input" style={{ width: '100%' }} value={form.subsidy_end_date || ''} onChange={(e) => setForm({ ...form, subsidy_end_date: e.target.value })} />
              </Field>
            </div>
          )}
          <Field label="Medical conditions, allergies or limitations (shown to coaches in attendance)">
            <textarea className="dp-input" style={{ width: '100%', minHeight: 44, resize: 'vertical' }} placeholder="None" value={form.medical || ''} onChange={(e) => setForm({ ...form, medical: e.target.value })} />
          </Field>
          <Field label="Promotional photos & videos">
            <select className="dp-select" style={{ width: '100%' }} value={form.photo_consent == null ? '' : form.photo_consent ? 'yes' : 'no'} onChange={(e) => setForm({ ...form, photo_consent: e.target.value === '' ? null : e.target.value === 'yes' })}>
              <option value="">Not asked</option>
              <option value="yes">Yes — family consents</option>
              <option value="no">NO — no promotional photos/videos</option>
            </select>
          </Field>
          <Field label="Notes">
            <textarea className="dp-input" style={{ width: '100%', minHeight: 60, resize: 'vertical' }} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          {formError && <p style={{ color: '#9A2B2B', fontSize: 13, margin: '4px 0 0' }}>{formError}</p>}
        </Modal>
      )}

      {cancelFor && (
        <CancellationModal
          student={cancelFor}
          onClose={() => setCancelFor(null)}
          onSaved={(row) => {
            if (row) setStudents((prev) => prev.map((x) => (x.id === row.id ? row : x)));
            setCancelFor(null);
          }}
        />
      )}

      {reactivateFor && (
        <Modal
          title={`Reactivate ${reactivateFor.name}`}
          maxWidth={480}
          onClose={() => setReactivateFor(null)}
          footer={
            <>
              <button className="dp-btn" onClick={() => setReactivateFor(null)}>Cancel</button>
              <button className="dp-btn" onClick={async () => { await setStudentStatus(reactivateFor.id, 'active'); setReactivateFor(null); }}>Reactivate, no fee</button>
              <button className="dp-btn dp-btn-primary" onClick={async () => { await setStudentStatus(reactivateFor.id, 'active', { reregistration_fee_due: true }); setReactivateFor(null); }}>Reactivate + ${REREGISTRATION_FEE} fee</button>
            </>
          }
        >
          <p style={{ fontSize: 14, lineHeight: 1.55, margin: 0 }}>
            {reactivateFor.name.split(' ')[0]}'s membership ended{reactivateFor.withdrawn_date ? ` on ${reactivateFor.withdrawn_date}` : ''}. Coming back after a membership has ended has a <b>${REREGISTRATION_FEE} re-registration fee</b> (Part 7.4). It goes on the next tuition invoice.
          </p>
          <p style={{ fontSize: 12.5, color: '#8A8D84', margin: '8px 0 0' }}>No fee if it was only a temporary payment issue, or a mistake.</p>
        </Modal>
      )}

      {welcomeFor && (
        <WelcomeEmailModal
          student={welcomeFor}
          onClose={() => setWelcomeFor(null)}
          onSent={(at) => {
            setStudents((prev) => prev.map((x) => (x.id === welcomeFor.id ? { ...x, welcome_sent_at: at } : x)));
            setWelcomeFor(null);
          }}
        />
      )}

      {reminder && (
        <Modal
          title={`Grant reminder — ${reminder.student.name}`}
          maxWidth={600}
          onClose={() => setReminder(null)}
          footer={
            <>
              <button className="dp-btn" onClick={() => setReminder(null)}>Cancel</button>
              <button className="dp-btn dp-btn-primary" disabled={reminder.sending} onClick={sendReminder}><Mail size={15} /> Send</button>
            </>
          }
        >
          {reminder.student.subsidy_reminded_at && (
            <p style={{ fontSize: 12.5, color: '#854F0B', margin: '0 0 10px' }}>Already sent on {new Date(reminder.student.subsidy_reminded_at).toLocaleDateString('en-CA')}.</p>
          )}
          <Field label="To (comma-separated)"><input className="dp-input" style={{ width: '100%' }} value={reminder.to} onChange={(e) => setReminder({ ...reminder, to: e.target.value })} /></Field>
          <Field label="Subject"><input className="dp-input" style={{ width: '100%' }} value={reminder.subject} onChange={(e) => setReminder({ ...reminder, subject: e.target.value })} /></Field>
          <Field label="Message (you can edit it for this family)">
            <textarea className="dp-input" rows={12} style={{ width: '100%', resize: 'vertical', fontSize: 13, lineHeight: 1.5 }} value={reminder.message} onChange={(e) => setReminder({ ...reminder, message: e.target.value })} />
          </Field>
          {reminder.error && <p style={{ color: '#9A2B2B', fontSize: 13, margin: 0 }}>{reminder.error}</p>}
        </Modal>
      )}

      {confirmDeleteId && (
        <ConfirmDialog message="Delete this student? This can't be undone." onCancel={() => setConfirmDeleteId(null)} onConfirm={() => confirmDelete(confirmDeleteId)} />
      )}

      {importState && (
        <Modal
          title="Match Excel Columns"
          maxWidth={560}
          onClose={() => setImportState(null)}
          footer={
            <>
              <button className="dp-btn" onClick={() => setImportState(null)}>
                Cancel
              </button>
              {importState.headers && (
                <button className="dp-btn dp-btn-primary" onClick={confirmImport}>
                  <Check size={15} /> Import {importState.dataRows.length}
                </button>
              )}
            </>
          }
        >
          {importState.error && <p style={{ color: '#9A2B2B', fontSize: 13, marginTop: 0 }}>{importState.error}</p>}
          {importState.headers && (
            <>
              <p style={{ fontSize: 13, color: '#5B5F56', marginTop: 0 }}>
                Match each spreadsheet column to a field. ({importState.dataRows.length} rows found)
              </p>
              {FIELD_DEFS.map((f) => (
                <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 13.5, width: 150, color: '#20241F' }}>
                    {f.label}
                    {f.required && <span style={{ color: '#9A2B2B' }}> *</span>}
                  </span>
                  <select
                    className="dp-select"
                    style={{ flex: 1 }}
                    value={importState.mapping[f.key]}
                    onChange={(e) => updateImportMapping(f.key, Number(e.target.value))}
                  >
                    <option value={-1}>(Not used)</option>
                    {importState.headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Column ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </>
          )}
        </Modal>
      )}
    </>
  );
}

function SectionLabel({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 600, color: '#8A8D84', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '6px 0 8px', paddingTop: 10, borderTop: '1px solid #EDEAE0' }}>{children}</div>;
}

function Badge({ c, title, children }) {
  return <span title={title} style={{ marginLeft: 6, fontSize: 10.5, color: c[0], border: `1px solid ${c[2]}`, background: c[1], borderRadius: 999, padding: '1px 6px', whiteSpace: 'nowrap' }}>{children}</span>;
}

// Standard tuition (before GST) for a number of classes a week.
export function suggestedTuition(perWeek, plan) {
  if (!perWeek) return '';
  if (plan === '3 Months') return perWeek === 2 ? 435 : '';
  return perWeek === 1 ? 135 : perWeek === 2 ? 150 : 200;
}
