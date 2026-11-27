import React, { useEffect, useMemo, useState } from 'react';
import { Search, Plus, Pencil, Trash2, Check, TrendingUp, MessageSquare, CalendarPlus, Mail } from 'lucide-react';
import TryoutsPage from '../tryouts/TryoutsPage';
import { timeLabel } from '../../lib/emailTemplates';
import LeadMessageModal from './LeadMessageModal';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import { LEAD_SOURCES, LEAD_STATUSES, TRYOUT_STATUSES } from '../../lib/constants';
import { todayISO } from '../../lib/billingDates';
import Field from '../../components/Field';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';

// Children on an inquiry: [{ name, age }] (siblings ask together).
export function leadKids(lead) {
  if (Array.isArray(lead?.children) && lead.children.length) return lead.children.map((k) => ({ name: k.name || '', age: k.age ?? '' }));
  return [{ name: lead?.student_name || '', age: lead?.student_age ?? '' }];
}
const joinNames = (names) => (names.length <= 1 ? names[0] || '' : names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1]);

function emptyForm() {
  return { student_name: '', guardian_name: '', phone: '', email: '', student_age: '', source: 'Phone', inquiry_date: todayISO(), status: 'New Inquiry', notes: '', linked_student_id: null };
}

export default function LeadsPage({ setActiveTab, tabs }) {
  const [leads, setLeads] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [formError, setFormError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [pastSearch, setPastSearch] = useState('');
  const [pastMatches, setPastMatches] = useState([]);
  const [linkedStudent, setLinkedStudent] = useState(null);
  const [messaging, setMessaging] = useState(null);
  const [flash, setFlash] = useState('');
  // Trials are part of an inquiry (tryouts.lead_id); the trial windows live in TryoutsPage.
  const [trials, setTrials] = useState([]);
  const [trialCmd, setTrialCmd] = useState(null);
  const trialsByLead = useMemo(() => {
    const m = {};
    trials.forEach((t) => { if (t.lead_id) (m[t.lead_id] ||= []).push(t); });
    Object.values(m).forEach((list) => list.sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))));
    return m;
  }, [trials]);

  useEffect(() => {
    fetchLeads();
  }, []);

  async function fetchLeads() {
    const [{ data }, { data: tr }] = await Promise.all([
      supabase.from('leads').select('*').order('inquiry_date', { ascending: false }),
      supabase.from('tryouts').select('*'),
    ]);
    setLeads(data || []);
    setTrials(tr || []);
  }
  async function setTrialStatus(t, status) {
    setTrials((list) => list.map((x) => (x.id === t.id ? { ...x, status } : x)));
    await supabase.from('tryouts').update({ status }).eq('id', t.id);
    fetchLeads(); // the inquiry status follows the trial
  }

  async function searchPastStudents() {
    if (!pastSearch.trim()) {
      setPastMatches([]);
      return;
    }
    const { data } = await supabase
      .from('students')
      .select('id, name, guardian_name, guardian_phone, guardian_email, enroll_date, status')
      .or(`name.ilike.%${pastSearch}%,guardian_phone.ilike.%${pastSearch}%`)
      .limit(6);
    setPastMatches(data || []);
  }

  function linkPastStudent(s) {
    setForm({ ...form, student_name: s.name, guardian_name: s.guardian_name, phone: s.guardian_phone, email: s.guardian_email, linked_student_id: s.id });
    setLinkedStudent(s);
    setPastMatches([]);
    setPastSearch('');
  }

  function unlinkPastStudent() {
    setForm({ ...form, linked_student_id: null });
    setLinkedStudent(null);
  }

  function openAdd() {
    setEditingId(null);
    setForm({ ...emptyForm(), kids: [{ name: '', age: '' }] });
    setFormError('');
    setLinkedStudent(null);
    setPastMatches([]);
    setPastSearch('');
    setModalOpen(true);
  }

  async function openEdit(lead) {
    setEditingId(lead.id);
    setForm({ ...emptyForm(), ...lead, kids: leadKids(lead) });
    setFormError('');
    setPastMatches([]);
    setPastSearch('');
    if (lead.linked_student_id) {
      const { data } = await supabase.from('students').select('id, name, guardian_name, guardian_phone, guardian_email, enroll_date, status').eq('id', lead.linked_student_id).single();
      setLinkedStudent(data || null);
    } else {
      setLinkedStudent(null);
    }
    setModalOpen(true);
  }

  async function submitForm() {
    const kids = (form.kids || leadKids(form)).map((k) => ({ name: String(k.name || '').trim(), age: k.age === '' || k.age == null ? null : Number(k.age) })).filter((k) => k.name || k.age != null);
    const names = kids.map((k) => k.name).filter(Boolean);
    if (!names.length && !String(form.guardian_name || '').trim()) {
      setFormError('Enter the student’s or the parent’s name (one is enough).');
      return;
    }
    let submitError;
    const { kids: _k, ...rest } = form;
    const row = { ...rest, children: kids.length ? kids : null, student_name: joinNames(names) || null, guardian_name: String(form.guardian_name || '').trim() || null, student_age: kids[0]?.age ?? null };
    // Empty fields are saved as blank, not "".
    Object.keys(row).forEach((k) => {
      if (typeof row[k] === 'string' && !row[k].trim()) row[k] = null;
    });
    if (editingId) ({ error: submitError } = await supabase.from('leads').update(row).eq('id', editingId));
    else ({ error: submitError } = await supabase.from('leads').insert(row));
    if (submitError) {
      setFormError('Could not save: ' + submitError.message);
      return;
    }
    setModalOpen(false);
    fetchLeads();
  }

  async function confirmDelete(id) {
    await supabase.from('tryouts').delete().eq('lead_id', id); // its trial bookings go too
    await supabase.from('leads').delete().eq('id', id);
    setConfirmDeleteId(null);
    fetchLeads();
  }

  async function setStatus(id, status) {
    const { data } = await supabase.from('leads').update({ status }).eq('id', id).select();
    if (data) setLeads((prev) => prev.map((l) => (l.id === id ? data[0] : l)));
  }

  async function convertToStudent(lead) {
    await setStatus(lead.id, 'Enrolled');
    if (lead.linked_student_id) {
      await supabase.from('students').update({ status: 'active', withdrawn_date: null, enroll_date: todayISO() }).eq('id', lead.linked_student_id);
      setActiveTab('students');
      return;
    }
    // Open Enrollment with the parent and every child from the inquiry.
    sessionStorage.setItem(
      'registerDraft',
      JSON.stringify({ guardian_name: lead.guardian_name, guardian_phone: lead.phone, guardian_email: lead.email, kids: leadKids(lead).map((k) => ({ name: k.name })) })
    );
    setActiveTab('register');
  }

  const stats = useMemo(() => {
    const total = leads.length;
    const consulted = leads.filter((l) => l.status !== 'New Inquiry').length;
    const enrolled = leads.filter((l) => l.status === 'Enrolled').length;
    const rate = total === 0 ? 0 : Math.round((enrolled / total) * 1000) / 10;
    return { total, consulted, enrolled, rate };
  }, [leads]);

  const filtered = useMemo(() => {
    return leads.filter((l) => {
      const today = todayISO();
      const tl = trialsByLead[l.id] || [];
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'trial-upcoming' ? tl.some((t) => t.date >= today && t.status === 'Scheduled')
          : statusFilter === 'trial-check' ? tl.some((t) => t.date < today && t.status === 'Scheduled')
          : l.status === statusFilter);
      const matchesSearch =
        !search.trim() ||
        (l.student_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (l.guardian_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (l.phone || '').includes(search) ||
        (l.email || '').toLowerCase().includes(search.toLowerCase()) ||
        // children on the inquiry and on its trial bookings
        (Array.isArray(l.children) ? l.children : []).some((k) => (k?.name || '').toLowerCase().includes(search.toLowerCase())) ||
        tl.some((t) => (t.student_name || '').toLowerCase().includes(search.toLowerCase()));
      return matchesStatus && matchesSearch;
    });
  }, [leads, statusFilter, search, trialsByLead]);

  const statusMeta = (status) => LEAD_STATUSES.find((s) => s.value === status) || LEAD_STATUSES[0];

  return (
    <>
      <div style={styles.header}>
        <div>
          {tabs || <h1 style={styles.title}>Leads & Trials</h1>}
          <p style={styles.subtitle}>{leads.length} inquiries · {trials.length} trials — a trial booking is part of its inquiry</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="dp-btn" onClick={() => setTrialCmd({ kind: 'book', lead: null, at: Date.now() })}>
            <CalendarPlus size={15} /> Book Trial
          </button>
          <button className="dp-btn dp-btn-primary" onClick={openAdd}>
            <Plus size={15} /> Add Inquiry
          </button>
        </div>
      </div>

      <TryoutsPage embedded setActiveTab={setActiveTab} cmd={trialCmd} onChanged={fetchLeads} />

      <div className="dp-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 18 }}>
        <div style={styles.metricCard}>
          <p style={styles.metricLabel}>Total Inquiries</p>
          <p style={styles.metricValue}>{stats.total}</p>
        </div>
        <div style={styles.metricCard}>
          <p style={styles.metricLabel}>Booked a Trial or Further</p>
          <p style={styles.metricValue}>{stats.consulted}</p>
        </div>
        <div style={styles.metricCard}>
          <p style={styles.metricLabel}>
            <TrendingUp size={12} style={{ verticalAlign: '-1px', marginRight: 4 }} />
            Enrollment Rate
          </p>
          <p style={styles.metricValue}>
            {stats.rate}% <span style={{ fontSize: 13, color: 'var(--dp-ink-soft)', fontWeight: 400 }}>({stats.enrolled}/{stats.total})</span>
          </p>
        </div>
      </div>

      <div style={styles.filterBar}>
        <div style={styles.searchBox}>
          <Search size={15} color="var(--dp-ink-soft)" />
          <input className="dp-input" style={{ border: 'none', flex: 1, padding: '4px 6px' }} placeholder="Search by student, guardian, or phone" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="dp-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All Statuses</option>
          <option value="trial-upcoming">Trial coming up</option>
          <option value="trial-check">Trial passed — not updated</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label || s.value}
            </option>
          ))}
        </select>
      </div>

      <div style={styles.card}>
        {filtered.length === 0 ? (
          <p style={{ padding: 20, color: 'var(--dp-ink-soft)', fontSize: 14 }}>No matching inquiries.</p>
        ) : (
          <table className="dp-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Guardian</th>
                <th>Phone</th>
                <th>Source</th>
                <th>Inquiry Date</th>
                <th>Trial</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => {
                const meta = statusMeta(l.status);
                return (
                  <tr key={l.id} className="dp-row">
                    <td style={{ fontWeight: 500 }}>
                      {l.student_name || <span style={{ color: 'var(--dp-ink-faint)', fontWeight: 400 }}>{leadKids(l).length > 1 ? `${leadKids(l).length} children` : 'Child'} (no name yet)</span>}
                      {leadKids(l).some((k) => k.age !== '' && k.age != null) && <span style={{ fontWeight: 400, color: 'var(--dp-ink-faint)', fontSize: 12.5 }}> · {leadKids(l).map((k) => (k.age !== '' && k.age != null ? k.age + 'y' : '?')).join(', ')}</span>}
                      {l.linked_student_id && (
                        <span style={{ marginLeft: 6, fontSize: 12.5, color: 'var(--dp-ink-soft)', border: '1px solid var(--dp-line)', borderRadius: 999, padding: '1px 6px' }}>Linked</span>
                      )}
                    </td>
                    <td>{l.guardian_name || '—'}</td>
                    <td>
                      {l.phone || '—'}
                      {l.contacted_at && (
                        <div style={{ fontSize: 12, color: 'var(--dp-success)' }}>✓ {l.contacted_by === 'email' ? 'Emailed' : 'Texted'} {new Date(l.contacted_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}</div>
                      )}
                    </td>
                    <td>{l.source}</td>
                    <td>{l.inquiry_date || '—'}</td>
                    <td style={{ minWidth: 210 }}>
                      {(trialsByLead[l.id] || []).map((t) => {
                        const tm = TRYOUT_STATUSES.find((x) => x.value === t.status) || TRYOUT_STATUSES[0];
                        const late = t.status === 'Scheduled' && t.date && t.date < todayISO();
                        return (
                          <div key={t.id} style={{ fontSize: 12.5, marginBottom: 4 }}>
                            <div style={{ whiteSpace: 'nowrap' }}>
                              {leadKids(l).length > 1 && <b>{String(t.student_name || '').split(' ')[0]} · </b>}
                              {t.date ? new Date(t.date + 'T00:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' }) : 'No date'}{t.time ? `, ${timeLabel(t.time)}` : ''}
                              <span style={{ color: 'var(--dp-ink-faint)' }}> · {t.class_name || '—'}</span>
                            </div>
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 2, flexWrap: 'wrap' }}>
                              <select className="dp-select" aria-label="Trial status" style={{ fontSize: 12, padding: '2px 4px', background: tm.bg, color: tm.text, borderColor: late ? 'var(--dp-warning)' : tm.border }} value={t.status} onChange={(e) => setTrialStatus(t, e.target.value)}>
                                {TRYOUT_STATUSES.map((x) => <option key={x.value} value={x.value}>{x.value}</option>)}
                              </select>
                              {t.guardian_email ? (
                                <button className="dp-btn" style={{ padding: '2px 6px', fontSize: 11.5 }} title="Trial confirmation email" onClick={() => setTrialCmd({ kind: 'email', t, at: Date.now() })}><Mail size={11} /> {t.confirmation_sent ? 'Sent ✓' : 'Confirm'}</button>
                              ) : t.guardian_phone ? (
                                <button className="dp-btn" style={{ padding: '2px 6px', fontSize: 11.5 }} title="Text the confirmation" onClick={() => setTrialCmd({ kind: 'text', t, at: Date.now() })}><MessageSquare size={11} /> {t.confirmation_sent ? 'Texted ✓' : 'Text'}</button>
                              ) : null}
                              <button className="dp-btn" aria-label="Edit trial" style={{ padding: 3 }} onClick={() => setTrialCmd({ kind: 'edit', t, at: Date.now() })}><Pencil size={11} /></button>
                            </div>
                            {late && <div style={{ fontSize: 11.5, color: 'var(--dp-warning)' }}>Did they come?</div>}
                          </div>
                        );
                      })}
                      {l.status !== 'Enrolled' && l.status !== 'Not Enrolled' && (
                        <button className="dp-btn" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => setTrialCmd({ kind: 'book', lead: l, at: Date.now() })}>
                          <CalendarPlus size={12} /> {(trialsByLead[l.id] || []).length ? 'Another' : 'Book trial'}
                        </button>
                      )}
                    </td>
                    <td>
                      <select
                        className="dp-select"
                        style={{ fontSize: 12.5, padding: '3px 6px', background: meta.bg, color: meta.text, borderColor: meta.border }}
                        value={l.status}
                        onChange={(e) => setStatus(l.id, e.target.value)}
                      >
                        {LEAD_STATUSES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label || s.value}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="dp-btn" style={{ padding: '4px 8px', fontSize: 12 }} title="Email or text: trial class times and KidSport info" onClick={() => setMessaging(l)}>
                          <MessageSquare size={13} /> Reply
                        </button>
                        {l.status !== 'Enrolled' && (
                          <button className="dp-btn" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => convertToStudent(l)}>
                            Enroll
                          </button>
                        )}
                        <button aria-label="Edit" className="dp-btn" style={{ padding: 6 }} onClick={() => openEdit(l)}>
                          <Pencil size={14} />
                        </button>
                        <button aria-label="Delete" className="dp-btn dp-btn-danger" style={{ padding: 6 }} onClick={() => setConfirmDeleteId(l.id)}>
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
          title={editingId ? 'Edit Inquiry' : 'Add Inquiry'}
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
          <div style={{ background: '#F6F4EF', border: '1px solid var(--dp-line)', borderRadius: 6, padding: 10, marginBottom: 14 }}>
            {linkedStudent ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                <span>
                  Linked to previous student: <strong>{linkedStudent.name}</strong> ({linkedStudent.status === 'withdrawn' ? 'Withdrawn' : 'Active'}, enrolled {linkedStudent.enroll_date})
                </span>
                <button className="dp-btn" style={{ padding: '2px 8px', fontSize: 12 }} onClick={unlinkPastStudent}>
                  Unlink
                </button>
              </div>
            ) : (
              <>
                <p style={{ fontSize: 12.5, color: 'var(--dp-ink-soft)', margin: '0 0 6px' }}>If this child was previously enrolled, search by name or phone to link their record.</p>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    className="dp-input"
                    style={{ flex: 1 }}
                    placeholder="Name or phone"
                    value={pastSearch}
                    onChange={(e) => setPastSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && searchPastStudents()}
                  />
                  <button className="dp-btn" onClick={searchPastStudents}>
                    Search
                  </button>
                </div>
                {pastMatches.length > 0 && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {pastMatches.map((s) => (
                      <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, background: '#FFFFFF', border: '1px solid var(--dp-line)', borderRadius: 6, padding: '5px 8px' }}>
                        <span>
                          {s.name} · {s.status === 'withdrawn' ? 'Withdrawn' : 'Active'} · enrolled {s.enroll_date || '—'}
                        </span>
                        <button className="dp-btn" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => linkPastStudent(s)}>
                          Link
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          <p style={{ fontSize: 12, color: 'var(--dp-ink-faint)', margin: '0 0 6px' }}>The child’s name or the parent’s name is enough to save.</p>
          <div style={{ marginBottom: 12 }}>
            <span style={{ display: 'block', fontSize: 12.5, color: 'var(--dp-ink-soft)', marginBottom: 4 }}>Child{(form.kids || []).length > 1 ? 'ren' : ''} — name and age</span>
            {(form.kids || [{ name: '', age: '' }]).map((k, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <input className="dp-input" style={{ flex: 1 }} placeholder={i === 0 ? 'Child’s name' : 'Sibling’s name'} value={k.name || ''} onChange={(e) => setForm({ ...form, kids: form.kids.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                <input className="dp-input" inputMode="numeric" style={{ width: 70 }} placeholder="Age" value={k.age ?? ''} onChange={(e) => setForm({ ...form, kids: form.kids.map((x, j) => (j === i ? { ...x, age: e.target.value.replace(/\D/g, '').slice(0, 2) } : x)) })} />
                {form.kids.length > 1 && <button className="dp-btn" style={{ padding: 6 }} aria-label="Remove child" onClick={() => setForm({ ...form, kids: form.kids.filter((_, j) => j !== i) })}><Trash2 size={13} /></button>}
              </div>
            ))}
            <button className="dp-btn" style={{ padding: '3px 10px', fontSize: 12.5 }} onClick={() => setForm({ ...form, kids: [...(form.kids || []), { name: '', age: '' }] })}><Plus size={13} /> Add a sibling</button>
          </div>
          <div style={styles.formRow}>
            <Field label="Guardian Name">
              <input className="dp-input" style={{ width: '100%' }} value={form.guardian_name || ''} onChange={(e) => setForm({ ...form, guardian_name: e.target.value })} />
            </Field>
            <Field label="Phone">
              <input className="dp-input" style={{ width: '100%' }} value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
          </div>
          <Field label="Email">
            <input type="email" className="dp-input" style={{ width: '100%' }} value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <div style={styles.formRow}>
            <Field label="Source">
              <select className="dp-select" style={{ width: '100%' }} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
                {LEAD_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Inquiry Date">
              <input type="date" className="dp-input" style={{ width: '100%' }} value={form.inquiry_date || ''} onChange={(e) => setForm({ ...form, inquiry_date: e.target.value })} />
            </Field>
          </div>
          <div style={styles.formRow}>
            <Field label="Status">
              <select className="dp-select" style={{ width: '100%' }} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {LEAD_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label || s.value}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Notes">
            <textarea className="dp-input" style={{ width: '100%', minHeight: 60, resize: 'vertical' }} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          {formError && <p style={{ color: 'var(--dp-danger)', fontSize: 13, margin: '4px 0 0' }}>{formError}</p>}
        </Modal>
      )}

      {messaging && (
        <LeadMessageModal
          lead={messaging}
          onDone={(row) => setLeads((list) => list.map((x) => (x.id === row.id ? { ...x, ...row } : x)))}
          onClose={(note) => { setMessaging(null); if (note) { setFlash(note); setTimeout(() => setFlash(''), 4000); } }}
        />
      )}
      {flash && <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: 'var(--dp-ink)', color: '#fff', padding: '8px 16px', borderRadius: 8, fontSize: 13.5, zIndex: 300 }}>{flash}</div>}

      {confirmDeleteId && <ConfirmDialog message={(trialsByLead[confirmDeleteId] || []).length ? "Delete this inquiry and its trial bookings? This can't be undone." : "Delete this inquiry? This can't be undone."} onCancel={() => setConfirmDeleteId(null)} onConfirm={() => confirmDelete(confirmDeleteId)} />}
    </>
  );
}
