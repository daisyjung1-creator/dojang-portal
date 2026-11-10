import React, { useEffect, useState } from 'react';
import { Download, Mail } from 'lucide-react';
import { supabase } from '../supabaseClient';
import Modal from './Modal';
import Field from './Field';
import { todayISO, addDaysISO, currentCycleStart, billingAnchor, planMonths } from '../lib/billingDates';
import { money } from '../lib/invoiceUtils';
import { weeklyPlan } from '../lib/classes';

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Same day n months later, minus one day (Nov 15 + 3 months → Feb 14).
function periodEnd(start, months) {
  const [y, m, d] = start.split('-').map(Number);
  const dt = new Date(y, m - 1 + months, d);
  const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  return addDaysISO(iso, -1);
}

export function classesText(student, schedule) {
  const plan = weeklyPlan(student, schedule);
  const days = [...new Set(plan.map((c) => WD[c.weekday]))].join(' & ');
  const names = [...new Set(plan.map((c) => c.class_name))].join(', ');
  const per = student.classes_per_week ? `${student.classes_per_week} class${student.classes_per_week === 1 ? '' : 'es'} per week` : '';
  return [per, days && `${days}${names ? ` (${names})` : ''}`].filter(Boolean).join(' — ');
}

function downloadBase64(b64, filename) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// KidSport (or other funding) proof of enrollment: club, child, program dates
// and total registration cost — download the PDF or email it to the parent.
export default function ProofOfEnrollmentModal({ student, onClose }) {
  const today = todayISO();
  const start0 = billingAnchor(student) ? currentCycleStart(student, today) : student.enroll_date || today;
  const [f, setF] = useState({ start: start0, months: 3, end: periodEnd(start0, 3), amount: '', classes: '', to: student.guardian_email || '', note: '' });
  const [gst, setGst] = useState(5);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);

  const perPlan = Number(student.tuition) || 0;
  const monthly = perPlan / planMonths(student);
  const calc = (months, rate = gst) => Math.round(monthly * months * (1 + rate / 100) * 100) / 100;

  useEffect(() => {
    Promise.all([
      supabase.from('invoice_settings').select('gst_rate').eq('id', 1).maybeSingle(),
      supabase.from('class_schedule').select('class_name, weekday, start_time').eq('active', true),
    ]).then(([{ data: s }, { data: sched }]) => {
      const rate = s?.gst_rate ?? 5;
      setGst(rate);
      setF((p) => ({ ...p, classes: classesText(student, sched || []), amount: p.amount === '' && monthly ? String(calc(p.months, rate)) : p.amount }));
    });
  }, [student.id]);

  const set = (patch) => setF((p) => ({ ...p, ...patch }));
  const setPeriod = (start, months) => {
    const patch = { start, months };
    if (months) {
      patch.end = periodEnd(start, months);
      if (monthly) patch.amount = String(calc(months));
    }
    set(patch);
  };

  async function run(action) {
    if (!f.start || !f.end || f.end < f.start) return setMsg({ err: true, text: 'Check the program dates.' });
    if (action === 'email' && !f.to.trim()) return setMsg({ err: true, text: 'No parent email.' });
    setBusy(action);
    setMsg(null);
    const { data, error } = await supabase.functions.invoke('proof-of-enrollment', {
      body: { action, student_id: student.id, start: f.start, end: f.end, amount: Number(f.amount) || 0, classes: f.classes.trim(), note: f.note.trim(), to: f.to.trim(), program: 'Taekwondo' },
    });
    setBusy('');
    let err = data?.error || null;
    if (error && !err) {
      try {
        err = (await error.context?.json())?.error;
      } catch (_e) {
        /* keep generic */
      }
      err = err || error.message;
    }
    if (err) return setMsg({ err: true, text: err });
    if (action === 'pdf') downloadBase64(data.pdf, data.filename);
    setMsg({ text: action === 'email' ? `Emailed to ${data.emailed.join(', ')} (copy to the dojang).` : 'Downloaded.' });
  }

  return (
    <Modal
      title={`Proof of enrollment — ${student.name}`}
      maxWidth={540}
      onClose={onClose}
      footer={
        <>
          <button className="dp-btn" onClick={onClose}>Close</button>
          <button className="dp-btn" disabled={!!busy} onClick={() => run('pdf')}><Download size={14} /> {busy === 'pdf' ? 'Making…' : 'Download PDF'}</button>
          <button className="dp-btn dp-btn-primary" disabled={!!busy || !f.to.trim()} onClick={() => run('email')}><Mail size={14} /> {busy === 'email' ? 'Sending…' : 'Email to parent'}</button>
        </>
      }
    >
      <p style={{ fontSize: 12.5, color: '#5B5F56', margin: '0 0 12px' }}>For KidSport: shows the club's name, the child's name, the program dates and the total registration cost.</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Field label="Program starts">
          <input type="date" className="dp-input" value={f.start} onChange={(e) => setPeriod(e.target.value, f.months)} />
        </Field>
        <Field label="Length">
          <select className="dp-select" value={f.months} onChange={(e) => setPeriod(f.start, Number(e.target.value))}>
            {[1, 3, 6, 12].map((n) => <option key={n} value={n}>{n} month{n === 1 ? '' : 's'}</option>)}
            <option value={0}>Custom end date</option>
          </select>
        </Field>
        <Field label="Program ends">
          <input type="date" className="dp-input" value={f.end} disabled={!!f.months} onChange={(e) => set({ end: e.target.value })} />
        </Field>
      </div>
      <Field label="Total registration cost (incl. GST)">
        <input type="number" step="0.01" className="dp-input" style={{ width: 160 }} value={f.amount} onChange={(e) => set({ amount: e.target.value })} />
        {monthly > 0 && f.months > 0 && (
          <span style={{ fontSize: 12, color: '#8A8D84', marginLeft: 8 }}>
            {money(monthly)}/month × {f.months} + {gst}% GST = {money(calc(f.months))}
          </span>
        )}
      </Field>
      <Field label="Classes (shown on the letter)">
        <input className="dp-input" style={{ width: '100%' }} value={f.classes} onChange={(e) => set({ classes: e.target.value })} />
      </Field>
      <Field label="Extra line (optional)">
        <input className="dp-input" style={{ width: '100%' }} placeholder="e.g. Tuition is paid monthly by credit card." value={f.note} onChange={(e) => set({ note: e.target.value })} />
      </Field>
      <Field label="Parent email">
        <input className="dp-input" style={{ width: '100%' }} value={f.to} onChange={(e) => set({ to: e.target.value })} />
      </Field>
      {msg && <p style={{ fontSize: 13, margin: '6px 0 0', color: msg.err ? '#9A2B2B' : '#2A5A30' }}>{msg.text}</p>}
    </Modal>
  );
}
