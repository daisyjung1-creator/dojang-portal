import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Check } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import { TRYOUT_STATUSES } from '../../lib/constants';
import { todayISO } from '../../lib/billingDates';
import Field from '../../components/Field';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';

function emptyForm() {
  return { student_name: '', guardian_phone: '', guardian_email: '', class_name: '', date: todayISO(), time: '', status: 'Scheduled', notes: '' };
}

export default function TryoutsPage({ setActiveTab }) {
  const [tryouts, setTryouts] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [formError, setFormError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  useEffect(() => {
    fetchTryouts();
  }, []);

  async function fetchTryouts() {
    const { data } = await supabase.from('tryouts').select('*').order('date', { ascending: false });
    setTryouts(data || []);
  }

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm());
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
      if (!error && data && form.guardian_email && form.guardian_email.trim()) {
        await supabase.from('email_queue').insert({
          type: 'tryout_confirmation',
          recipient_email: form.guardian_email.trim(),
          payload: { tryout_id: data.id, student_name: data.student_name, date: data.date, time: data.time, class_name: data.class_name },
          sent: false,
        });
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
        <button className="dp-btn dp-btn-primary" onClick={openAdd}>
          <Plus size={15} /> Add Booking
        </button>
      </div>

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
                    <td>{t.time || '—'}</td>
                    <td style={{ fontSize: 12.5, color: t.confirmation_sent ? '#2A5A30' : '#5B5F56' }}>
                      {t.guardian_email ? (t.confirmation_sent ? 'Sent' : 'Pending') : '—'}
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

      {confirmDeleteId && <ConfirmDialog message="Delete this booking? This can't be undone." onCancel={() => setConfirmDeleteId(null)} onConfirm={() => confirmDelete(confirmDeleteId)} />}
    </>
  );
}
