import React, { useEffect, useState } from 'react';
import { Check, Mail, Plus, X, Users } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import { BELTS } from '../../lib/constants';
import { todayISO, PLANS } from '../../lib/billingDates';
import Field from '../../components/Field';
import ClassPicker from '../../components/ClassPicker';
import ClassDaysPicker from '../../components/ClassDaysPicker';
import WelcomeEmailModal from '../../components/WelcomeEmailModal';
import { allClassNames } from '../../lib/classes';
import { suggestedTuition } from '../students/StudentsPage';
import CustomerPicker from '../invoices/CustomerPicker';
import OnlineRegistrations, { kidName } from './OnlineRegistrations';

// Parent / family details — entered once for all the children.
function emptyFamily() {
  return { existing_customer_id: '', guardian_name: '', guardian_phone: '', guardian_email: '', address: '', emergency_name: '', emergency_phone: '', payment_type: 'preauth' };
}
// Per child.
function emptyChild(copyFrom) {
  return {
    name: '',
    dob: '',
    belt: 'White',
    class_name: '',
    class_days: null,
    classes_per_week: '',
    plan: copyFrom?.plan || '1 Month',
    tuition: '',
    enroll_date: copyFrom?.enroll_date || todayISO(),
    billing_start_date: copyFrom?.billing_start_date || '',
    family_discount: !!copyFrom?.family_discount,
    billing_exempt: false,
    subsidy: false,
    subsidy_name: '',
    subsidy_amount: '',
    subsidy_end_date: '',
    notes: '',
  };
}

const sectionLabel = { fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#8A8D84', margin: '4px 0 10px' };

export default function RegisterPage() {
  const [family, setFamily] = useState(emptyFamily());
  const [kids, setKids] = useState([emptyChild()]);
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [classes, setClasses] = useState([]);
  const [recent, setRecent] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [welcomeFor, setWelcomeFor] = useState(null); // array of students
  // The online registration (from /join) currently loaded into the form.
  const [fromOnline, setFromOnline] = useState(null);
  const [onlineReload, setOnlineReload] = useState(0);

  // Fill the form from an online registration. The parent's class picks come
  // in as they chose them; change anything before saving.
  function loadOnline(r) {
    const f = r.family || {};
    const email = (f.email || '').trim().toLowerCase();
    const match = email && customers.find((c) => c.active !== false && String(c.email || '').toLowerCase().split(/[,;\s]+/).includes(email));
    setFamily({
      existing_customer_id: match ? match.id : '',
      guardian_name: f.guardian_name || '',
      guardian_phone: f.phone || '',
      guardian_email: f.email || '',
      address: [f.address, f.postal].filter(Boolean).join(', '),
      emergency_name: f.emergency_name || '',
      emergency_phone: f.emergency_phone || '',
      payment_type: String(r.plan || '').includes('PAD') ? 'preauth' : 'manual',
    });
    const start = r.start_date || todayISO();
    const perWeek = ['2', '3', '4'].includes(r.frequency) ? r.frequency : '';
    setKids(
      (r.kids || []).map((k) => {
        const notes = [
          `Online registration ${String(r.created_at).slice(0, 10)}${r.adult_student ? ' (adult student)' : ''}.`,
          k.medical ? `Medical: ${k.medical_detail}` : 'Medical: none',
          k.instructions ? `Emergency instructions: ${k.instructions}` : '',
          `Photo/video consent: ${r.photo_consent ? 'Yes' : 'NO'}`,
          !r.adult_student && f.relationship ? `Guardian: ${f.relationship}` : '',
          f.emergency_relationship ? `Emergency contact: ${f.emergency_relationship}` : '',
          r.frequency === 'other' ? `Program: ${r.other_program}` : '',
          f.heard ? `Heard about us: ${f.heard === 'Other' ? f.heard_other || 'Other' : f.heard}` : '',
        ].filter(Boolean).join('\n');
        return {
          ...emptyChild(),
          name: kidName(k),
          dob: k.dob || '',
          class_name: k.class_name || '',
          class_days: k.class_days && k.class_days.length ? k.class_days : null,
          classes_per_week: perWeek ? Number(perWeek) : '',
          plan: r.plan === 'Monthly PAD' ? '1 Month' : '3 Months',
          tuition: perWeek ? suggestedTuition(Number(perWeek), r.plan === 'Monthly PAD' ? '1 Month' : '3 Months') : '',
          enroll_date: start,
          billing_start_date: start,
          notes,
        };
      })
    );
    setFromOnline({ id: r.id, names: (r.kids || []).map(kidName).join(', '), family: match ? match.name : null });
    setFormError('');
    setSuccess('');
    setTimeout(() => document.getElementById('enroll-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  useEffect(() => {
    // Picks up a draft handed off from a converted trial booking, if any.
    const draft = sessionStorage.getItem('registerDraft');
    if (draft) {
      const d = JSON.parse(draft);
      setFamily((f) => ({ ...f, guardian_name: d.guardian_name || '', guardian_phone: d.guardian_phone || '', guardian_email: d.guardian_email || '', address: d.address || '' }));
      if (Array.isArray(d.kids) && d.kids.length) setKids(d.kids.map((k) => ({ ...emptyChild(), name: k.name || '', class_name: k.class_name || '', dob: k.dob || '' })));
      else setKids([{ ...emptyChild(), name: d.name || '', class_name: d.class_name || '', dob: d.dob || '' }]);
      sessionStorage.removeItem('registerDraft');
    }
    loadClasses();
    loadQueue();
    supabase.from('customers').select('id, name, email, phone, address, active').order('name').then(({ data }) => setCustomers(data || []));
  }, []);

  async function loadClasses() {
    const { data } = await supabase.from('students').select('class_name');
    setClasses(allClassNames(data || []));
  }

  async function loadQueue() {
    const { data } = await supabase.from('students').select('*').order('created_at', { ascending: false }).limit(15);
    setRecent(data || []);
  }

  // Adding a child to a family that's already here: copy the parent details
  // from one of its students.
  async function pickFamily(customerId) {
    if (!customerId) return setFamily((f) => ({ ...f, existing_customer_id: '' }));
    const [{ data: st }, { data: c }] = await Promise.all([
      supabase.from('students').select('guardian_name, guardian_phone, guardian_email, address, emergency_name, emergency_phone').eq('customer_id', customerId).limit(1),
      supabase.from('customers').select('name, email, phone, address, payment_type').eq('id', customerId).maybeSingle(),
    ]);
    const s = st?.[0] || {};
    setFamily({
      existing_customer_id: customerId,
      guardian_name: s.guardian_name || '',
      guardian_phone: s.guardian_phone || c?.phone || '',
      guardian_email: s.guardian_email || c?.email || '',
      address: s.address || c?.address || '',
      emergency_name: s.emergency_name || '',
      emergency_phone: s.emergency_phone || '',
      payment_type: c?.payment_type || 'preauth',
    });
  }

  const setKid = (i, patch) => setKids((list) => list.map((k, j) => (j === i ? { ...k, ...patch } : k)));
  const addKid = () => setKids((list) => [...list, emptyChild(list[list.length - 1])]);
  const removeKid = (i) => setKids((list) => list.filter((_, j) => j !== i));

  async function submitRegistration() {
    const named = kids.filter((k) => k.name.trim());
    if (!named.length) return setFormError('Please enter the student’s name.');
    if (named.length < kids.length) return setFormError('Every child needs a name (or remove the empty one).');
    const bad = named.find((k) => k.subsidy && !k.subsidy_end_date);
    if (bad) return setFormError(`${bad.name}: enter when the subsidy ends.`);
    setSaving(true);
    setFormError('');
    const fam = {
      guardian_name: family.guardian_name.trim() || null,
      guardian_phone: family.guardian_phone.trim() || null,
      guardian_email: family.guardian_email.trim() || null,
      address: family.address.trim() || null,
      emergency_name: family.emergency_name.trim() || null,
      emergency_phone: family.emergency_phone.trim() || null,
    };
    let customerId = family.existing_customer_id || null;
    const created = [];
    for (const k of named) {
      const row = {
        ...fam,
        name: k.name.trim(),
        dob: k.dob || null,
        belt: k.belt || 'White',
        class_name: k.class_name || null,
        classes_per_week: k.classes_per_week === '' ? null : Number(k.classes_per_week),
        class_days: k.class_days && k.class_days.length ? k.class_days : null,
        plan: k.plan || '1 Month',
        tuition: k.tuition === '' ? null : Number(k.tuition),
        enroll_date: k.enroll_date || todayISO(),
        billing_start_date: k.billing_start_date || null,
        family_discount: !!k.family_discount,
        billing_exempt: !!k.billing_exempt,
        subsidy: !!k.subsidy,
        subsidy_name: k.subsidy ? k.subsidy_name || 'KidSport' : null,
        subsidy_amount: k.subsidy && k.subsidy_amount !== '' ? Number(k.subsidy_amount) : null,
        subsidy_end_date: k.subsidy ? k.subsidy_end_date || null : null,
        notes: k.notes.trim() || null,
        // Siblings go into the same family as the first child.
        customer_id: customerId,
      };
      const { data, error } = await supabase.from('students').insert(row).select();
      if (error) {
        setSaving(false);
        setFormError(`Could not register ${row.name}: ${error.message}` + (created.length ? ` (${created.map((c) => c.name).join(', ')} already saved)` : ''));
        return;
      }
      created.push(data[0]);
      customerId = customerId || data[0].customer_id || null;
    }
    if (customerId && family.payment_type) {
      await supabase.from('customers').update({ payment_type: family.payment_type }).eq('id', customerId);
    }
    if (fromOnline) {
      await supabase.from('registrations').update({ status: 'approved', student_ids: created.map((c) => c.id), handled_at: new Date().toISOString() }).eq('id', fromOnline.id);
      setFromOnline(null);
      setOnlineReload((n) => n + 1);
    }
    setSaving(false);
    setRecent((prev) => [...created.slice().reverse(), ...prev]);
    setSuccess(created.length === 1 ? `${created[0].name} registered.` : `${created.map((c) => c.name.split(' ')[0]).join(', ')} registered as one family.`);
    // One welcome email for the whole family, to review before it goes out.
    if (fam.guardian_email) setWelcomeFor(created);
    setFamily(emptyFamily());
    setKids([emptyChild()]);
  }

  const inp = { width: '100%' };

  return (
    <>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Enrollment</h1>
          <p style={styles.subtitle}>Parent details once, then each child · one welcome email for the family</p>
        </div>
      </div>

      <OnlineRegistrations onLoad={loadOnline} reloadKey={onlineReload} />

      <div id="enroll-form" style={{ ...styles.card, padding: 20, marginBottom: 20, maxWidth: 680 }}>
        {fromOnline && (
          <div style={{ background: '#EAF1F7', border: '1px solid #C5D6E6', color: '#1E4566', borderRadius: 6, padding: '8px 12px', fontSize: 13.5, marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ flex: 1 }}>
              Online registration loaded: <b>{fromOnline.names}</b>. Check the classes, set the tuition, then Register.
              {fromOnline.family && <> Matched existing family <b>{fromOnline.family}</b> by email.</>}
            </span>
            <button className="dp-btn" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => { setFromOnline(null); setFamily(emptyFamily()); setKids([emptyChild()]); }}>Clear</button>
          </div>
        )}
        {success && (
          <div style={{ background: '#E8F1E9', border: '1px solid #BFDCC3', color: '#2A5A30', borderRadius: 6, padding: '8px 12px', fontSize: 13.5, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{success}</span>
            <button className="dp-btn" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => setSuccess('')}>Close</button>
          </div>
        )}

        <div style={sectionLabel}>Parent / guardian</div>
        <Field label="Adding to a family that's already registered? (optional)">
          <CustomerPicker customers={customers} value={family.existing_customer_id} onChange={pickFamily} includeInactive={false} />
        </Field>
        <div style={styles.formRow}>
          <Field label="Guardian name">
            <input className="dp-input" style={inp} value={family.guardian_name} onChange={(e) => setFamily({ ...family, guardian_name: e.target.value })} />
          </Field>
          <Field label="Guardian phone">
            <input className="dp-input" style={inp} value={family.guardian_phone} onChange={(e) => setFamily({ ...family, guardian_phone: e.target.value })} />
          </Field>
        </div>
        <Field label="Guardian email(s) — separate with commas; invoices go to all">
          <input className="dp-input" style={inp} placeholder="mom@example.com, dad@example.com" value={family.guardian_email} onChange={(e) => setFamily({ ...family, guardian_email: e.target.value })} />
        </Field>
        <Field label="Address">
          <textarea className="dp-input" rows={2} style={{ ...inp, resize: 'vertical' }} value={family.address} onChange={(e) => setFamily({ ...family, address: e.target.value })} />
        </Field>
        <div style={styles.formRow}>
          <Field label="Emergency contact name">
            <input className="dp-input" style={inp} value={family.emergency_name} onChange={(e) => setFamily({ ...family, emergency_name: e.target.value })} />
          </Field>
          <Field label="Emergency phone">
            <input className="dp-input" style={inp} value={family.emergency_phone} onChange={(e) => setFamily({ ...family, emergency_phone: e.target.value })} />
          </Field>
        </div>
        <Field label="How the family pays">
          <select className="dp-select" style={inp} value={family.payment_type} onChange={(e) => setFamily({ ...family, payment_type: e.target.value })}>
            <option value="preauth">Pre-authorized credit card</option>
            <option value="manual">Pays manually — debit / cash (gets invoice + reminder)</option>
          </select>
        </Field>

        {kids.map((k, i) => (
          <div key={i} style={{ border: '1px solid #EDEAE0', borderRadius: 10, padding: '14px 14px 4px', margin: '16px 0 0', background: i ? '#FCFBF8' : '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ ...sectionLabel, margin: 0 }}>{kids.length === 1 ? 'Student' : `Child ${i + 1}`}</div>
              {kids.length > 1 && (
                <button className="dp-btn" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => removeKid(i)}><X size={12} /> Remove</button>
              )}
            </div>
            <div style={styles.formRow}>
              <Field label="Student name" required>
                <input className="dp-input" style={inp} value={k.name} onChange={(e) => setKid(i, { name: e.target.value })} />
              </Field>
              <Field label="Date of birth">
                <input type="date" className="dp-input" style={inp} value={k.dob} onChange={(e) => setKid(i, { dob: e.target.value })} />
              </Field>
            </div>
            <div style={styles.formRow}>
              <Field label="Belt">
                <select className="dp-select" style={inp} value={k.belt} onChange={(e) => setKid(i, { belt: e.target.value })}>
                  {BELTS.map((b) => <option key={b.value} value={b.value}>{b.value}</option>)}
                </select>
              </Field>
              <Field label="Classes per week">
                <select
                  className="dp-select"
                  style={inp}
                  value={k.classes_per_week}
                  onChange={(e) => {
                    const n = e.target.value === '' ? '' : Number(e.target.value);
                    setKid(i, { classes_per_week: n, tuition: k.tuition === '' ? suggestedTuition(n, k.plan) : k.tuition });
                  }}
                >
                  <option value="">—</option>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} × per week</option>)}
                </select>
              </Field>
            </div>
            <div style={{ marginBottom: 12 }}>
              <span style={{ display: 'block', fontSize: 12.5, color: '#5B5F56', marginBottom: 4 }}>Classes (pick all that apply)</span>
              <ClassPicker value={k.class_name || ''} onChange={(v) => setKid(i, { class_name: v })} options={classes} />
            </div>
            <ClassDaysPicker classNames={k.class_name} perWeek={k.classes_per_week} value={k.class_days} onChange={(v) => setKid(i, { class_days: v })} />
            <div style={styles.formRow}>
              <Field label="Plan">
                <select className="dp-select" style={inp} value={k.plan} onChange={(e) => setKid(i, { plan: e.target.value })}>
                  {PLANS.map((p) => <option key={p.value}>{p.value}</option>)}
                </select>
              </Field>
              <Field label={k.plan === '3 Months' ? 'Tuition per 3 months ($, before GST)' : 'Monthly tuition ($, before GST)'}>
                <input type="number" className="dp-input" style={inp} value={k.tuition} onChange={(e) => setKid(i, { tuition: e.target.value })} />
              </Field>
            </div>
            <div style={styles.formRow}>
              <Field label="Enrollment date">
                <input type="date" className="dp-input" style={inp} value={k.enroll_date} onChange={(e) => setKid(i, { enroll_date: e.target.value })} />
              </Field>
              <Field label="Billing starts (default: same)">
                <input type="date" className="dp-input" style={inp} value={k.billing_start_date || k.enroll_date || ''} onChange={(e) => setKid(i, { billing_start_date: e.target.value === k.enroll_date ? '' : e.target.value })} />
              </Field>
            </div>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 10 }}>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13.5 }}>
                <input type="checkbox" checked={k.family_discount} onChange={(e) => setKid(i, { family_discount: e.target.checked })} /> Big family discount (20%)
              </label>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13.5 }}>
                <input type="checkbox" checked={k.subsidy} onChange={(e) => setKid(i, { subsidy: e.target.checked })} /> Subsidy (KidSport etc.)
              </label>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13.5 }}>
                <input type="checkbox" checked={k.billing_exempt} onChange={(e) => setKid(i, { billing_exempt: e.target.checked })} /> Coach / instructor (not invoiced)
              </label>
            </div>
            {k.subsidy && (
              <div style={styles.formRow}>
                <Field label="Subsidy">
                  <input className="dp-input" style={inp} placeholder="KidSport" value={k.subsidy_name} onChange={(e) => setKid(i, { subsidy_name: e.target.value })} />
                </Field>
                <Field label="Amount / month ($)">
                  <input type="number" className="dp-input" style={inp} value={k.subsidy_amount} onChange={(e) => setKid(i, { subsidy_amount: e.target.value })} />
                </Field>
                <Field label="Subsidy ends" required>
                  <input type="date" className="dp-input" style={inp} value={k.subsidy_end_date} onChange={(e) => setKid(i, { subsidy_end_date: e.target.value })} />
                </Field>
              </div>
            )}
            <Field label="Notes">
              <textarea className="dp-input" style={{ ...inp, minHeight: 44, resize: 'vertical' }} value={k.notes} onChange={(e) => setKid(i, { notes: e.target.value })} />
            </Field>
          </div>
        ))}

        <button className="dp-btn" style={{ marginTop: 12 }} onClick={addKid}>
          <Plus size={14} /> Add a sibling
        </button>
        <span style={{ fontSize: 12, color: '#8A8D84', marginLeft: 10 }}>Same parent, phone, email and address — just the child’s own details.</span>

        {formError && <p style={{ color: '#9A2B2B', fontSize: 13, margin: '12px 0 0' }}>{formError}</p>}
        <div style={{ marginTop: 16 }}>
          <button className="dp-btn dp-btn-primary" disabled={saving} onClick={submitRegistration}>
            {kids.length > 1 ? <Users size={15} /> : <Check size={15} />} {saving ? 'Saving…' : kids.length > 1 ? `Register ${kids.length} children` : 'Complete registration'}
          </button>
        </div>
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
                    <button className="dp-btn" style={{ padding: '4px 8px', fontSize: 12 }} disabled={!w.guardian_email} onClick={() => setWelcomeFor([w])}>
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
          students={welcomeFor}
          onClose={() => setWelcomeFor(null)}
          onSent={(at) => {
            const ids = new Set(welcomeFor.map((x) => x.id));
            setRecent((prev) => prev.map((x) => (ids.has(x.id) ? { ...x, welcome_sent_at: at } : x)));
            setWelcomeFor(null);
          }}
        />
      )}
    </>
  );
}
