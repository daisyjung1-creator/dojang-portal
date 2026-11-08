import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { SCHOOL, HEARD_FROM } from '../../lib/agreement';
import logoImg from '../../assets/logo.png';
import { Page, Section, Label, Row, In, Area, Chip, C, box, btn, linkBtn } from './JoinPage';

// Public trial-class booking (no login): /trial
// 10 and under → Beginner (Tue/Thu 4:30), 11 and up → Intermediate B (Mon/Wed
// 4:30). Families pick a date; the booking becomes a lead + a trial in the
// portal and a confirmation email goes out (the dojang gets a copy).

const classForAge = (age) => (age === '' || age == null ? null : Number(age) >= 11 ? 'Intermediate B' : 'Beginner');
const t12 = (t) => {
  const [h, m] = String(t || '').split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`;
};
const dayLabel = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
const longDay = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' });
const emptyKid = () => ({ name: '', age: '', date: '' });

export default function TrialPage() {
  const [slots, setSlots] = useState(null);
  const [kids, setKids] = useState([emptyKid()]);
  const [fam, setFam] = useState({ guardian_name: '', email: '', phone: '', heard: '', notes: '' });
  const [trap, setTrap] = useState('');
  const [tried, setTried] = useState(false);
  const [sendError, setSendError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(null);

  const load = () => supabase.rpc('public_trial_slots').then(({ data }) => setSlots(data || []));
  useEffect(() => {
    document.title = `Book a Free Trial · ${SCHOOL.name}`;
    load();
  }, []);

  const setKid = (i, patch) => setKids((l) => l.map((k, j) => (j === i ? { ...k, ...patch } : k)));
  const setF = (k) => (e) => setFam({ ...fam, [k]: e.target.value });
  const byClass = useMemo(() => {
    const m = {};
    (slots || []).forEach((s) => (m[s.class_name] = m[s.class_name] || []).push(s));
    return m;
  }, [slots]);
  // Seats a child takes from a session's free spots when siblings pick the same one.
  const takenHere = (cls, date, except) => kids.filter((k, j) => j !== except && classForAge(k.age) === cls && k.date === date).length;

  function validate() {
    const e = [];
    kids.forEach((k, i) => {
      const who = kids.length > 1 ? `Child ${i + 1}: ` : '';
      if (!k.name.trim()) e.push(`${who}name`);
      if (k.age === '' || Number(k.age) < 3 || Number(k.age) > 80) e.push(`${who}age`);
      else if (!k.date) e.push(`${who}pick a trial date`);
    });
    if (fam.guardian_name.trim().length < 2) e.push('Your name');
    if (!/^\S+@\S+\.\S+$/.test(fam.email.trim())) e.push('A valid email address');
    if (fam.phone.replace(/\D/g, '').length < 7) e.push('Phone number');
    return e;
  }
  const errors = sendError ? [sendError] : tried ? validate() : [];

  async function submit() {
    setTried(true);
    setSendError('');
    if (validate().length) {
      setTimeout(() => document.getElementById('trial-errors')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
      return;
    }
    if (trap) return setDone([]);
    setSaving(true);
    const { data, error } = await supabase.rpc('book_trial', {
      p: { ...fam, kids: kids.map((k) => ({ name: k.name.trim(), age: Number(k.age), date: k.date })) },
    });
    setSaving(false);
    if (error) {
      setSendError(String(error.message || 'Something went wrong').replace(/^.*?: /, ''));
      load();
      return;
    }
    setDone(data || []);
    window.scrollTo(0, 0);
  }

  if (done) {
    return (
      <Page subtitle="Free Trial Class">
        <div style={{ ...box, textAlign: 'center', padding: '32px 22px' }}>
          <img src={logoImg} alt="Hankook Taekwondo" style={{ width: 150, maxWidth: '60%', height: 'auto' }} />
          <h2 style={{ margin: '14px 0 10px', fontSize: 22 }}>You're booked!</h2>
          {done.map((d) => (
            <div key={d.name} style={{ fontSize: 16, margin: '6px 0' }}>
              <b>{d.name}</b> — {d.class}, {longDay(d.date)} at {t12(d.time)}
            </div>
          ))}
          <p style={{ color: C.soft, margin: '14px auto 0', maxWidth: 440, lineHeight: 1.55 }}>
            A confirmation email is on its way. Please arrive about 10 minutes early in comfortable clothes (t-shirt and track pants) and bring a water bottle.
          </p>
          <p style={{ color: C.faint, fontSize: 13.5, marginTop: 16 }}>Need to change the date? Just reply to the email or write to {SCHOOL.email}.</p>
        </div>
      </Page>
    );
  }

  return (
    <Page subtitle="Book a Free Trial Class">
      <p style={{ color: C.soft, lineHeight: 1.55, margin: '0 0 18px', fontSize: 15 }}>
        Come try a class with us — it's free! Pick a date below and we'll see you at the Dojang. Fields marked <b style={{ color: C.red }}>*</b> are required.
      </p>

      <Section n="1" title="Who's coming?">
        <div style={{ fontSize: 13.5, color: C.soft, marginBottom: 12, lineHeight: 1.5 }}>
          Trial classes: <b>10 and under</b> — Beginner, Tue &amp; Thu 4:30–5:20 pm · <b>11 and up</b> — Intermediate B, Mon &amp; Wed 4:30–5:20 pm
        </div>
        {kids.map((k, i) => {
          const cls = classForAge(k.age);
          const list = cls ? byClass[cls] || [] : [];
          return (
            <div key={i} style={{ ...box, marginBottom: 14, ...(kids.length > 1 ? { borderLeft: `4px solid ${C.red}` } : {}) }}>
              {kids.length > 1 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <b>Child {i + 1}</b>
                  <button type="button" style={linkBtn} onClick={() => setKids((l) => l.filter((_, j) => j !== i))}>Remove</button>
                </div>
              )}
              <Row>
                <In label="Name" req value={k.name} onChange={(e) => setKid(i, { name: e.target.value })} autoComplete="off" />
                <In label="Age" req type="number" inputMode="numeric" min={3} max={80} value={k.age} onChange={(e) => setKid(i, { age: e.target.value, date: '' })} style={{ maxWidth: 120 }} />
              </Row>
              {cls && (
                <>
                  <Label req>Pick a trial date — {cls}, {list[0] ? `${t12(list[0].start_time)}–${t12(list[0].end_time)}` : '4:30 pm'}</Label>
                  {slots == null ? (
                    <div style={{ fontSize: 13.5, color: C.faint }}>Loading dates…</div>
                  ) : list.length === 0 ? (
                    <div style={{ fontSize: 14, color: C.soft }}>No dates open right now — please email {SCHOOL.email} and we'll find a time.</div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {list.map((s) => {
                        const full = s.booked + takenHere(cls, s.date, i) >= s.capacity;
                        const on = k.date === s.date;
                        return (
                          <button
                            key={s.date}
                            type="button"
                            disabled={full && !on}
                            onClick={() => setKid(i, { date: on ? '' : s.date })}
                            style={{ ...btn, padding: '9px 12px', fontSize: 14.5, background: on ? C.red : full ? '#F1EFE7' : '#fff', color: on ? '#fff' : full ? C.faint : C.ink, borderColor: on ? C.red : '#D6D2C4', cursor: full && !on ? 'not-allowed' : 'pointer' }}
                          >
                            {on ? '✓ ' : ''}{dayLabel(s.date)}{full && !on ? ' · full' : ''}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
        {kids.length < 4 && (
          <button type="button" style={{ ...btn, background: '#fff' }} onClick={() => setKids((l) => [...l, emptyKid()])}>
            + Add an additional child
          </button>
        )}
      </Section>

      <Section n="2" title="Your contact information">
        <In label="Parent/guardian name" req value={fam.guardian_name} onChange={setF('guardian_name')} autoComplete="name" />
        <Row>
          <In label="Email" req type="email" value={fam.email} onChange={setF('email')} autoComplete="email" />
          <In label="Phone" req type="tel" value={fam.phone} onChange={setF('phone')} autoComplete="tel" />
        </Row>
        <Label>How did you hear about us?</Label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {HEARD_FROM.map((h) => <Chip key={h} on={fam.heard === h} onClick={() => setFam({ ...fam, heard: fam.heard === h ? '' : h })}>{h}</Chip>)}
        </div>
        <Area label="Anything we should know? (optional)" value={fam.notes} onChange={setF('notes')} placeholder="Experience, injuries, questions…" />
        <input tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} aria-hidden="true" name="website" style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }} />
      </Section>

      {errors.length > 0 && (
        <div id="trial-errors" style={{ background: C.redSoft, color: '#8C1D18', border: '1px solid #F0C9C6', borderRadius: 10, padding: '12px 16px', marginBottom: 14, fontSize: 14.5 }}>
          <b>Please check:</b>
          <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>{errors.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      )}
      <button type="button" disabled={saving} onClick={submit} style={{ ...btn, background: C.red, borderColor: C.red, color: '#fff', width: '100%', padding: 15, fontSize: 17, fontWeight: 700 }}>
        {saving ? 'Booking…' : 'Book my free trial'}
      </button>
    </Page>
  );
}
