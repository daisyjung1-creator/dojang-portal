import React, { useEffect, useState } from 'react';
import { Check, Mail } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import { BELTS } from '../../lib/constants';
import { todayISO } from '../../lib/billingDates';
import Field from '../../components/Field';
import ClassPicker from '../../components/ClassPicker';
import WelcomeEmailModal from '../../components/WelcomeEmailModal';
import { PLANS } from '../../lib/billingDates';
import { allClassNames } from '../../lib/classes';

function emptyForm() {
  return { name: '', guardian_name: '', guardian_phone: '', guardian_email: '', belt: 'White', class_name: '', tuition: '', enroll_date: todayISO(), billing_start_date: '', plan: '1 Month', notes: '' };
}

export default function RegisterPage() {
  const [form, setForm] = useState(emptyForm());
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState(false);
  const [classes, setClasses] = useState([]);
  const [recent, setRecent] = useState([]);
  const [welcomeFor, setWelcomeFor] = useState(null);

  useEffect(() => {
    // Picks up a draft handed off from a converted trial booking, if any.
    const draft = sessionStorage.getItem('registerDraft');
    if (draft) {
      setForm((prev) => ({ ...prev, ...JSON.parse(draft) }));
      sessionStorage.removeItem('registerDraft');
    }
    loadClasses();
    loadQueue();
  }, []);

  async function loadClasses() {
    const { data } = await supabase.from('students').select('class_name');
    setClasses(allClassNames(data || []));
  }

  async function loadQueue() {
    const { data } = await supabase.from('students').select('*').order('created_at', { ascending: false }).limit(15);
    setRecent(data || []);
  }

  async function submitRegistration() {
    if (!form.name.trim()) {
      setFormError('Please enter a student name.');
      return;
    }
    const payload = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === '' ? null : v]));
    payload.name = form.name.trim();
    payload.tuition = form.tuition === '' ? null : Number(form.tuition);
    const { data, error } = await supabase.from('students').insert(payload).select();
    if (error) {
      setFormError('Could not register: ' + error.message);
      return;
    }
    const newStudent = data[0];
    setRecent((prev) => [newStudent, ...prev]);
    // Show the welcome email to review before it goes out.
    if ((form.guardian_email || '').trim()) setWelcomeFor(newStudent);
    setForm(emptyForm());
    setFormError('');
    setSuccess(true);
  }


  return (
    <>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Enrollment</h1>
          <p style={styles.subtitle}>After registering you can review and send the welcome email</p>
        </div>
      </div>

      <div style={{ ...styles.card, padding: 20, marginBottom: 20, maxWidth: 480 }}>
        {success && (
          <div
            style={{
              background: '#E8F1E9',
              border: '1px solid #BFDCC3',
              color: '#2A5A30',
              borderRadius: 6,
              padding: '8px 12px',
              fontSize: 13.5,
              marginBottom: 14,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>Registered.</span>
            <button className="dp-btn" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => setSuccess(false)}>
              Close
            </button>
          </div>
        )}
        <Field label="Student Name" required>
          <input className="dp-input" style={{ width: '100%' }} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <div style={styles.formRow}>
          <Field label="Guardian Name">
            <input className="dp-input" style={{ width: '100%' }} value={form.guardian_name || ''} onChange={(e) => setForm({ ...form, guardian_name: e.target.value })} />
          </Field>
          <Field label="Guardian Phone">
            <input className="dp-input" style={{ width: '100%' }} value={form.guardian_phone || ''} onChange={(e) => setForm({ ...form, guardian_phone: e.target.value })} />
          </Field>
        </div>
        <Field label="Guardian Email(s) — separate with commas">
          <input className="dp-input" style={{ width: '100%' }} value={form.guardian_email || ''} onChange={(e) => setForm({ ...form, guardian_email: e.target.value })} />
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
        <div style={styles.formRow}>
          <Field label="Enrollment Date">
            <input type="date" className="dp-input" style={{ width: '100%' }} value={form.enroll_date} onChange={(e) => setForm({ ...form, enroll_date: e.target.value })} />
          </Field>
          <Field label="Billing Starts (default: same)">
            <input type="date" className="dp-input" style={{ width: '100%' }} value={form.billing_start_date || form.enroll_date || ''} onChange={(e) => setForm({ ...form, billing_start_date: e.target.value === form.enroll_date ? '' : e.target.value })} />
          </Field>
        </div>
        <div style={styles.formRow}>
          <Field label="Plan">
            <select className="dp-select" style={{ width: '100%' }} value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
              {PLANS.map((p) => <option key={p.value}>{p.value}</option>)}
            </select>
          </Field>
          <Field label={form.plan === '3 Months' ? 'Tuition per 3 months ($, before GST)' : 'Monthly Tuition ($, before GST)'}>
            <input type="number" className="dp-input" style={{ width: '100%' }} value={form.tuition} onChange={(e) => setForm({ ...form, tuition: e.target.value })} />
          </Field>
        </div>
        <Field label="Notes">
          <textarea className="dp-input" style={{ width: '100%', minHeight: 50, resize: 'vertical' }} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
        {formError && <p style={{ color: '#9A2B2B', fontSize: 13, margin: '4px 0 12px' }}>{formError}</p>}
        <button className="dp-btn dp-btn-primary" style={{ marginTop: 8 }} onClick={submitRegistration}>
          <Check size={15} /> Complete Registration
        </button>
      </div>

      <h2 style={{ fontSize: 15, fontWeight: 500, margin: '0 0 8px' }}>Recently registered</h2>
      <div style={styles.card}>
        {recent.length === 0 ? (
          <p style={{ padding: 20, color: '#5B5F56', fontSize: 14 }}>No students yet.</p>
        ) : (
          <table className="dp-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Guardian Email</th>
                <th>Enrolled</th>
                <th>Welcome email</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {recent.map((w) => (
                <tr key={w.id} className="dp-row">
                  <td style={{ fontWeight: 500 }}>{w.name}</td>
                  <td>{w.guardian_email || <span style={{ color: '#8A8D84' }}>none</span>}</td>
                  <td>{w.enroll_date}</td>
                  <td>
                    <span style={{ fontSize: 12.5, color: w.welcome_sent_at ? '#2A5A30' : '#5B5F56' }}>
                      {w.welcome_sent_at ? 'Sent ' + new Date(w.welcome_sent_at).toLocaleDateString('en-CA') : 'Not sent'}
                    </span>
                  </td>
                  <td>
                    <button className="dp-btn" style={{ padding: '4px 8px', fontSize: 12 }} disabled={!w.guardian_email} onClick={() => setWelcomeFor(w)}>
                      <Mail size={13} /> {w.welcome_sent_at ? 'Send again' : 'Send'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {welcomeFor && (
        <WelcomeEmailModal
          student={welcomeFor}
          onClose={() => setWelcomeFor(null)}
          onSent={(at) => {
            setRecent((prev) => prev.map((x) => (x.id === welcomeFor.id ? { ...x, welcome_sent_at: at } : x)));
            setWelcomeFor(null);
          }}
        />
      )}
    </>
  );
}
