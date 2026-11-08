import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../supabaseClient';
import logoImg from '../../assets/logo.png';
import markImg from '../../assets/logo-mark.png';
import {
  AGREEMENT_VERSION, SCHOOL, HEARD_FROM, FREQUENCIES, PLAN_CHOICES, EMERGENCY_AUTH, TERMS,
  PHOTO_NOTE, PHOTO_YES, PHOTO_NO, ACKNOWLEDGMENTS, INTRO, boldParts,
} from '../../lib/agreement';

// Public registration form (no login): /join
// Families fill in the Student Registration & Membership Agreement online.
// It is saved as a pending registration; the Dojang reviews it in the portal
// (Enrollment tab), confirms classes and tuition, and creates the students.

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const t12 = (t) => {
  const [h, m] = String(t || '').split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`;
};
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const ageOn = (dob, on) => {
  if (!dob) return null;
  const a = new Date(dob);
  const b = new Date(on || today());
  let y = b.getFullYear() - a.getFullYear();
  if (b.getMonth() < a.getMonth() || (b.getMonth() === a.getMonth() && b.getDate() < a.getDate())) y--;
  return y >= 0 && y < 120 ? y : null;
};
// New students start in: 10 and under → Beginner, 11 and up → Intermediate B.
// Classes families can choose online (Comp Team, its Advance Poomsae /
// Sparring sessions and HP are by invitation, so they aren't offered here).
// Same guide as the printed class schedule.
export const JOIN_CLASSES = [
  { name: 'Beginner', short: 'Beginner', grid: 'Beginner', ages: 'All ages', belts: 'White – Green', min: null, max: null },
  { name: 'Beginner/Intermediate', short: 'Beg/Inter', grid: 'Beg/Inter', ages: 'Age 12 & under', belts: 'White – Blue', min: null, max: 12 },
  { name: 'Intermediate A', short: 'Intermediate A', grid: 'Inter A', ages: 'Age 8 to 12', belts: 'Yellow – Red', min: 8, max: 12 },
  { name: 'Intermediate B', short: 'Intermediate B', grid: 'Inter B', ages: 'Age 11 & up', belts: 'Yellow – Red', min: 11, max: null },
  { name: 'Intermediate/Advance', short: 'Inter/Adv', grid: 'Inter/Adv', ages: 'Age 8 & up', belts: 'Green – Red', min: 8, max: null },
];
const classInfo = Object.fromEntries(JOIN_CLASSES.map((c) => [c.name, c]));
const fitsAge = (c, age) => age == null || ((c.min == null || age >= c.min) && (c.max == null || age <= c.max));
const t12short = (t) => t12(t).replace(/ (am|pm)$/, '');
const slotKey = (c) => `${c.weekday}:${c.class_name}`;

const C = {
  ink: '#20241F', soft: '#5B5F56', faint: '#8A8D84', line: '#E4E0D4', paper: '#FAF8F2', red: '#BF1C21', redSoft: '#FBEDEC', green: '#2A5A30',
};

const emptyKid = () => ({ first: '', last: '', dob: '', medical: '', medical_detail: '', instructions: '', slots: [] });

export default function JoinPage() {
  const [schedule, setSchedule] = useState([]);
  const [adult, setAdult] = useState(false);
  const [fam, setFam] = useState({
    guardian_name: '', relationship: '', phone: '', email: '', address: '', postal: '',
    emergency_name: '', emergency_phone: '', emergency_relationship: '', heard: '', heard_other: '',
  });
  const [kids, setKids] = useState([emptyKid()]);
  const [frequency, setFrequency] = useState('');
  const [otherProgram, setOtherProgram] = useState('');
  const [plan, setPlan] = useState('');
  const [startDate, setStartDate] = useState('');
  const [photo, setPhoto] = useState(null);
  const [agree, setAgree] = useState(false);
  const [initials, setInitials] = useState({}); // { p5: 'JP', … } for parts that need initials
  const [signature, setSignature] = useState(''); // printed full name
  const [sigImage, setSigImage] = useState(null); // drawn signature (PNG data URL)
  const [trap, setTrap] = useState(''); // left empty by people, filled by spam bots
  const [tried, setTried] = useState(false); // after the first Submit, the list updates as they fix things
  const [sendError, setSendError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    document.title = `Registration · ${SCHOOL.name}`;
    supabase.rpc('public_class_schedule').then(({ data }) => setSchedule(data || []));
  }, []);

  const classNames = useMemo(() => [...new Set(schedule.map((c) => c.class_name))], [schedule]);
  const setF = (k) => (e) => setFam({ ...fam, [k]: e.target.value });
  const setKid = (i, patch) => setKids((l) => l.map((k, j) => (j === i ? { ...k, ...patch } : k)));

  function validate() {
    const e = [];
    if (!fam.guardian_name.trim()) e.push(adult ? 'Your full name' : 'Parent/guardian name');
    if (!adult && !fam.relationship.trim()) e.push('Relationship to the student');
    if (!fam.phone.trim()) e.push('Phone number');
    if (!/^\S+@\S+\.\S+$/.test(fam.email.trim())) e.push('A valid email address');
    if (!fam.address.trim()) e.push('Home address');
    if (!fam.postal.trim()) e.push('Postal code');
    if (!fam.emergency_name.trim() || !fam.emergency_phone.trim()) e.push('Emergency contact name and phone');
    kids.forEach((k, i) => {
      const who = kids.length > 1 ? `Student ${i + 1}: ` : '';
      if (!k.first.trim() || !k.last.trim()) e.push(`${who}first and last name`);
      if (!k.dob) e.push(`${who}date of birth`);
      if (!k.medical) e.push(`${who}medical conditions (Yes or No)`);
      if (k.medical === 'yes' && !k.medical_detail.trim()) e.push(`${who}please explain the medical condition`);
    });
    if (!frequency) e.push('Training frequency');
    if (frequency === 'other' && !otherProgram.trim()) e.push('Which other program');
    if (!plan) e.push('Membership & payment option');
    const needInit = TERMS.filter((t) => t.initial && !String(initials[t.key] || '').replace(/[^A-Z]/g, ''));
    if (needInit.length) e.push(`Initials for ${needInit.map((t) => t.title.split(' — ')[0]).join(', ')}`);
    if (photo == null) e.push('Photo & video consent (Yes or No)');
    if (!agree) e.push('Tick the box to agree to the terms');
    if (signature.trim().length < 2) e.push(adult ? 'Your full name (above the signature)' : 'Parent/guardian full name (above the signature)');
    if (!sigImage) e.push('Sign in the signature box');
    return e;
  }

  async function submit() {
    const e = validate();
    setTried(true);
    setSendError('');
    if (e.length) {
      setTimeout(() => document.getElementById('join-errors')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
      return;
    }
    if (trap) return setDone({ names: [] });
    setSaving(true);
    const kidRows = kids.map((k) => {
      const picked = schedule.filter((c) => k.slots.includes(slotKey(c)));
      return {
        first: k.first.trim(),
        last: k.last.trim(),
        dob: k.dob,
        medical: k.medical === 'yes',
        medical_detail: k.medical === 'yes' ? k.medical_detail.trim() : '',
        instructions: k.instructions.trim(),
        class_name: [...new Set(picked.map((c) => c.class_name))].join(', '),
        class_days: picked.map(slotKey),
      };
    });
    const row = {
      family: { ...Object.fromEntries(Object.entries(fam).map(([k, v]) => [k, String(v).trim()])), relationship: adult ? 'Self' : fam.relationship.trim() },
      kids: kidRows,
      frequency,
      other_program: frequency === 'other' ? otherProgram.trim() : null,
      plan,
      start_date: startDate || null,
      photo_consent: photo,
      signature_name: signature.trim(),
      signature_image: sigImage,
      initials: Object.fromEntries(TERMS.filter((t) => t.initial).map((t) => [t.key, String(initials[t.key] || '').trim()])),
      signed_on: today(),
      adult_student: adult,
      agreement_version: AGREEMENT_VERSION,
    };
    const { error } = await supabase.from('registrations').insert(row);
    setSaving(false);
    if (error) {
      setSendError(`Sorry — we couldn't send your registration (${error.message}). Please try again, or email ${SCHOOL.email}.`);
      return;
    }
    setDone({ names: kidRows.map((k) => k.first), row });
    window.scrollTo(0, 0);
  }

  if (done) {
    return (
      <Page>
        <div style={{ ...box, textAlign: 'center', padding: '36px 22px' }}>
          <img src={logoImg} alt="Hankook Taekwondo" style={{ width: 150, maxWidth: '60%', height: 'auto' }} />
          <h2 style={{ margin: '14px 0 8px', fontSize: 22 }}>Thank you{done.names.length ? `, ${done.names.join(' & ')} ${done.names.length > 1 ? 'are' : 'is'} registered!` : '!'}</h2>
          <p style={{ color: C.soft, margin: '0 auto 6px', maxWidth: 440, lineHeight: 1.55 }}>
            We've received your registration and emailed you a copy of the signed agreement. Master Daisy will confirm the class schedule, tuition and payment details with you by email or phone.
          </p>
          {done.row?.plan?.includes('Credit Card') && (
            <p style={{ color: C.soft, margin: '10px auto 0', maxWidth: 440, lineHeight: 1.55 }}>A separate Credit Card Authorization is completed at the Dojang before automatic payments begin.</p>
          )}
          <p style={{ color: C.faint, fontSize: 13.5, marginTop: 18 }}>Questions? {SCHOOL.email}</p>
        </div>
      </Page>
    );
  }

  const name = (k) => k.first.trim() || 'the student';
  const errors = sendError ? [sendError] : tried ? validate() : [];
  return (
    <Page>
      <p style={{ color: C.soft, lineHeight: 1.55, margin: '0 0 18px', fontSize: 15 }}>
        Welcome! Please fill in this form to register. It takes about 5 minutes. Fields marked <b style={{ color: C.red }}>*</b> are required.
      </p>

      {/* PART 1 + 3 per student */}
      <Section n="1" title="Student information">
        <label style={{ ...check, marginBottom: 12 }}>
          <input type="checkbox" checked={adult} onChange={(e) => { setAdult(e.target.checked); if (e.target.checked) setKids((l) => l.slice(0, 1)); }} />
          <span>I am registering myself (18 or older)</span>
        </label>
        <ClassGuide />
        {kids.map((k, i) => {
          const age = ageOn(k.dob, startDate);
          return (
            <div key={i} style={{ ...box, marginBottom: 14, ...(kids.length > 1 ? { borderLeft: `4px solid ${C.red}` } : {}) }}>
              {kids.length > 1 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <b style={{ fontSize: 15 }}>Student {i + 1}</b>
                  <button type="button" style={linkBtn} onClick={() => setKids((l) => l.filter((_, j) => j !== i))}>Remove</button>
                </div>
              )}
              <Row>
                <In label="First name" req value={k.first} onChange={(e) => setKid(i, { first: e.target.value })} autoComplete="off" />
                <In label="Last name" req value={k.last} onChange={(e) => setKid(i, { last: e.target.value })} autoComplete="off" />
              </Row>
              <In label="Date of birth" req type="date" value={k.dob} max={today()} onChange={(e) => setKid(i, { dob: e.target.value })} style={{ maxWidth: 220 }} />
              {age != null && <div style={{ fontSize: 13, color: C.faint, marginTop: -6, marginBottom: 10 }}>Age {age}</div>}

              <Label req>Does {name(k)} have any medical conditions, injuries, allergies, or physical limitations that may affect safe participation in Taekwondo?</Label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                {[['no', 'No'], ['yes', 'Yes']].map(([v, l]) => (
                  <Chip key={v} on={k.medical === v} onClick={() => setKid(i, { medical: v })}>{l}</Chip>
                ))}
              </div>
              {k.medical === 'yes' && <Area label="Please explain" req value={k.medical_detail} onChange={(e) => setKid(i, { medical_detail: e.target.value })} />}
              <Area label="Emergency instructions or activity restrictions (optional)" value={k.instructions} onChange={(e) => setKid(i, { instructions: e.target.value })} />

              <Label>Which classes would {name(k)} like to come to? <span style={{ color: C.faint, fontWeight: 400 }}>Tap each class. The Dojang will confirm.</span></Label>
              {!schedule.length ? (
                <div style={{ fontSize: 13.5, color: C.faint }}>Loading the class schedule…</div>
              ) : (
                <>
                  {age != null && (
                    <div style={{ fontSize: 13, color: C.green, marginBottom: 6 }}>
                      Usual classes for age {age}: {JOIN_CLASSES.filter((c) => fitsAge(c, age)).map((c) => c.short).join(', ')}. Age groups are a guide; the Dojang places each student by age, size and experience.
                    </div>
                  )}
                  <WeekGrid schedule={schedule} age={age} picked={k.slots} onToggle={(key) => setKid(i, { slots: k.slots.includes(key) ? k.slots.filter((x) => x !== key) : [...k.slots, key] })} />
                </>
              )}
            </div>
          );
        })}
        {!adult && kids.length < 6 && (
          <button type="button" style={{ ...btn, background: '#fff' }} onClick={() => setKids((l) => [...l, { ...emptyKid(), last: l[0]?.last || '' }])}>
            + Add an additional child
          </button>
        )}
      </Section>

      {/* PART 2 */}
      <Section n="2" title={adult ? 'Your contact information' : 'Parent / guardian information'}>
        <Row>
          <In label={adult ? 'Your full name' : 'Parent/guardian name'} req value={fam.guardian_name} onChange={setF('guardian_name')} autoComplete="name" />
          {!adult && <In label="Relationship to student" req value={fam.relationship} onChange={setF('relationship')} placeholder="Mother, Father, …" />}
        </Row>
        <Row>
          <In label="Phone number" req type="tel" value={fam.phone} onChange={setF('phone')} autoComplete="tel" />
          <In label="Email address" req type="email" value={fam.email} onChange={setF('email')} autoComplete="email" />
        </Row>
        <Row>
          <In label="Home address" req value={fam.address} onChange={setF('address')} autoComplete="street-address" />
          <In label="Postal code" req value={fam.postal} onChange={setF('postal')} autoComplete="postal-code" style={{ maxWidth: 160 }} />
        </Row>
        <div style={{ height: 6 }} />
        <Row>
          <In label="Emergency contact name" req value={fam.emergency_name} onChange={setF('emergency_name')} />
          <In label="Emergency contact phone" req type="tel" value={fam.emergency_phone} onChange={setF('emergency_phone')} />
        </Row>
        <In label="Emergency contact's relationship to student" value={fam.emergency_relationship} onChange={setF('emergency_relationship')} />
        <Label>How did you hear about us?</Label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {HEARD_FROM.map((h) => <Chip key={h} on={fam.heard === h} onClick={() => setFam({ ...fam, heard: fam.heard === h ? '' : h })}>{h}</Chip>)}
        </div>
        {fam.heard === 'Other' && <In label="Other" value={fam.heard_other} onChange={setF('heard_other')} />}
      </Section>

      <Section n="3" title="Emergency authorization">
        <div style={{ ...small, ...box, background: C.paper }}>
          {EMERGENCY_AUTH.map((p) => <p key={p} style={{ margin: '0 0 8px' }}>{p}</p>)}
        </div>
      </Section>

      {/* PART 4 */}
      <Section n="4" title="Membership">
        <Label req>Training frequency</Label>
        <div style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
          {FREQUENCIES.map((f) => (
            <Option key={f.value} on={frequency === f.value} onClick={() => setFrequency(f.value)} title={f.label} note={f.note} />
          ))}
        </div>
        {frequency === 'other' && <In label="Which program?" req value={otherProgram} onChange={(e) => setOtherProgram(e.target.value)} />}
        <Label req>Membership & payment</Label>
        <div style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
          {PLAN_CHOICES.map((p) => (
            <Option key={p.value} on={plan === p.value} onClick={() => setPlan(p.value)} title={p.label} note={p.note} />
          ))}
        </div>
        <In label="Preferred start date" type="date" value={startDate} min={today()} onChange={(e) => setStartDate(e.target.value)} style={{ maxWidth: 220 }} />
        <p style={{ ...small, color: C.soft, margin: '4px 0 0' }}>
          The Dojang will confirm tuition, taxes and payment dates with you.{plan.includes('Credit Card') ? ' Your credit card details are collected separately at the Dojang (a separate Credit Card Authorization) — please don’t enter them here.' : ''}
        </p>
      </Section>

      {/* PARTS 4–12 */}
      <Section n="4–12" title="Membership terms">
        <p style={{ ...small, color: C.soft, marginTop: 0 }}>Please read each part. Where it asks, type your <b>initials</b> to show you've read it.</p>
        <div style={{ ...small, color: C.soft, fontStyle: 'italic', marginBottom: 10 }}>{INTRO.map((p) => <p key={p} style={{ margin: '0 0 6px' }}>{p}</p>)}</div>
        {TERMS.map((t) => (
          <div key={t.key} style={{ ...box, ...small, marginBottom: 10, ...(t.initial ? { borderLeft: `4px solid ${initials[t.key]?.trim() ? C.green : C.red}` } : {}) }}>
            <div style={{ fontWeight: 700, fontSize: 14.5, color: C.ink, marginBottom: 6 }}>{t.title}</div>
            {t.body.map((b, j) =>
              typeof b === 'string' ? (
                <p key={j} style={{ margin: '0 0 6px' }}><Rich text={b} /></p>
              ) : (
                <ul key={j} style={{ margin: '0 0 6px', paddingLeft: 20 }}>{b.list.map((x) => <li key={x}><Rich text={x} /></li>)}</ul>
              )
            )}
            {t.initial && (
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.line}` }}>
                <span style={{ fontWeight: 600 }}>I have read {t.title.split(' — ')[0]}. Initials <b style={{ color: C.red }}>*</b></span>
                <input
                  value={initials[t.key] || ''}
                  maxLength={4}
                  autoCapitalize="characters"
                  autoComplete="off"
                  onChange={(e) => setInitials({ ...initials, [t.key]: e.target.value.toUpperCase().replace(/[^A-Z.\- ]/g, '') })}
                  style={{ ...field, width: 74, textAlign: 'center', fontWeight: 700, letterSpacing: '0.08em', padding: '9px 6px' }}
                />
              </label>
            )}
          </div>
        ))}
      </Section>

      {/* PART 13 */}
      <Section n="13" title="Photo & video consent">
        <div style={{ ...small, color: C.soft, marginBottom: 10 }}>{PHOTO_NOTE[0]}</div>
        <div style={{ display: 'grid', gap: 6 }}>
          <Option on={photo === true} onClick={() => setPhoto(true)} title={PHOTO_YES} />
          <Option on={photo === false} onClick={() => setPhoto(false)} title={PHOTO_NO} />
        </div>
        <div style={{ ...small, color: C.faint, marginTop: 8 }}>{PHOTO_NOTE[1]} {PHOTO_NOTE[2]}</div>
      </Section>

      {/* PART 14 */}
      <Section n="14" title="Acknowledgment & signature">
        <div style={{ ...small, marginBottom: 10 }}>By signing below, I confirm that:</div>
        <ul style={{ ...small, margin: '0 0 12px', paddingLeft: 20, color: C.soft }}>{ACKNOWLEDGMENTS.map((a) => <li key={a} style={{ marginBottom: 3 }}>{a}</li>)}</ul>
        <label style={{ ...check, ...box, background: agree ? '#EEF5EF' : '#fff', marginBottom: 12 }}>
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ width: 20, height: 20 }} />
          <span style={{ fontWeight: 600 }}>I have read and agree to the Student Registration & Membership Agreement.</span>
        </label>
        <div style={{ ...box, marginBottom: 10 }}>
          <div style={{ fontSize: 13.5, color: C.soft, marginBottom: 10 }}>
            <b style={{ color: C.ink }}>Student name{kids.length > 1 ? 's' : ''}:</b> {kids.map((k) => `${k.first} ${k.last}`.trim()).filter(Boolean).join(', ') || '—'}
          </div>
          <In label={adult ? 'Adult student — full name' : 'Parent/guardian name'} req value={signature} onChange={(e) => setSignature(e.target.value)} autoComplete="name" />
          <Label req>{adult ? 'Adult student signature' : 'Parent/guardian signature'} <span style={{ color: C.faint, fontWeight: 400 }}>— sign with your finger or mouse</span></Label>
          <SignaturePad onChange={setSigImage} />
        </div>
        <input tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} aria-hidden="true" style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }} name="website" />
      </Section>

      {errors.length > 0 && (
        <div id="join-errors" style={{ background: C.redSoft, color: '#8C1D18', border: '1px solid #F0C9C6', borderRadius: 10, padding: '12px 16px', marginBottom: 14, fontSize: 14.5 }}>
          <b>Please check:</b>
          <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>{errors.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      )}
      <button type="button" disabled={saving} onClick={submit} style={{ ...btn, background: C.red, borderColor: C.red, color: '#fff', width: '100%', padding: '15px', fontSize: 17, fontWeight: 700 }}>
        {saving ? 'Sending…' : 'Submit registration'}
      </button>
      <p style={{ textAlign: 'center', fontSize: 12.5, color: C.faint, marginTop: 14 }}>Agreement version {AGREEMENT_VERSION} · All terms are subject to applicable laws of Alberta and Canada.</p>
    </Page>
  );
}

// ---------- layout pieces ----------
const box = { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: 16 };
const small = { fontSize: 13.5, lineHeight: 1.55, color: C.ink };
const check = { display: 'flex', gap: 10, alignItems: 'center', fontSize: 15, cursor: 'pointer' };
const btn = { border: `1px solid ${C.line}`, borderRadius: 10, padding: '11px 16px', fontSize: 15, cursor: 'pointer', color: C.ink, fontFamily: 'inherit' };
const linkBtn = { background: 'none', border: 'none', padding: 0, color: C.red, fontSize: 13.5, cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' };
const field = { width: '100%', boxSizing: 'border-box', border: `1px solid #D6D2C4`, borderRadius: 9, padding: '11px 12px', fontSize: 16, fontFamily: 'inherit', color: C.ink, background: '#fff' };

function Page({ children }) {
  return (
    <div style={{ minHeight: '100vh', background: C.paper, fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif', color: C.ink }}>
      <div style={{ background: C.ink, color: '#fff', padding: '18px 16px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 14 }}>
          <img src={markImg} alt="Hankook Taekwondo" style={{ width: 50, height: 50, objectFit: 'contain', background: '#fff', borderRadius: 10, padding: 3, flex: 'none' }} />
          <div>
            <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '0.01em' }}>{SCHOOL.name}</div>
            <div style={{ fontSize: 13.5, opacity: 0.75 }}>Student Registration & Membership Agreement</div>
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 120px' }}>{children}</div>
      <div style={{ textAlign: 'center', fontSize: 12.5, color: C.faint, padding: '0 16px 40px' }}>{SCHOOL.address} · {SCHOOL.email}</div>
    </div>
  );
}
function Section({ n, title, children }) {
  return (
    <section style={{ marginBottom: 26 }}>
      <h2 style={{ fontSize: 17, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ background: C.red, color: '#fff', borderRadius: 999, minWidth: 26, height: 26, padding: '0 8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, boxSizing: 'border-box' }}>{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}
function Label({ req, children }) {
  return <div style={{ fontSize: 14, fontWeight: 600, margin: '4px 0 6px', lineHeight: 1.4 }}>{children}{req && <b style={{ color: C.red }}> *</b>}</div>;
}
function Row({ children }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0 12px' }}>{React.Children.map(children, (c) => c && <div style={{ flex: '1 1 220px', minWidth: 0 }}>{c}</div>)}</div>;
}
function In({ label, req, style, ...p }) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <Label req={req}>{label}</Label>
      <input {...p} style={{ ...field, ...style }} />
    </label>
  );
}
function Area({ label, req, ...p }) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <Label req={req}>{label}</Label>
      <textarea rows={2} {...p} style={{ ...field, resize: 'vertical' }} />
    </label>
  );
}
function Chip({ on, onClick, children }) {
  return (
    <button type="button" onClick={onClick} style={{ ...btn, padding: '9px 13px', fontSize: 14.5, background: on ? C.ink : '#fff', color: on ? '#fff' : C.ink, borderColor: on ? C.ink : '#D6D2C4' }}>
      {on ? '✓ ' : ''}{children}
    </button>
  );
}
function Option({ on, onClick, title, note }) {
  return (
    <button type="button" onClick={onClick} style={{ ...btn, textAlign: 'left', display: 'flex', gap: 12, alignItems: 'flex-start', background: on ? '#FFF7F6' : '#fff', borderColor: on ? C.red : '#D6D2C4', borderWidth: on ? 2 : 1, padding: on ? '10px 15px' : '11px 16px' }}>
      <span style={{ width: 18, height: 18, borderRadius: 999, border: `2px solid ${on ? C.red : '#B9B5A8'}`, flex: 'none', marginTop: 1, boxShadow: on ? `inset 0 0 0 3px #fff` : 'none', background: on ? C.red : '#fff' }} />
      <span>
        <span style={{ fontSize: 15, lineHeight: 1.45 }}>{title}</span>
        {note && <span style={{ display: 'block', fontSize: 13, color: C.faint, marginTop: 2 }}>{note}</span>}
      </span>
    </button>
  );
}

// The weekly timetable, like the printed schedule: tap a class to pick it.
function WeekGrid({ schedule, age, picked, onToggle }) {
  const sessions = schedule.filter((c) => classInfo[c.class_name]);
  const days = [1, 2, 3, 4, 5].filter((d) => sessions.some((c) => c.weekday === d));
  const rows = [...new Set(sessions.map((c) => (String(c.start_time) < '17:00' ? 0 : 1)))].sort();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`, gap: 4, background: C.ink, padding: 4, borderRadius: 10 }}>
      {days.map((d) => (
        <div key={d} style={{ color: '#F2C230', textAlign: 'center', fontSize: 11.5, fontWeight: 700, letterSpacing: '0.06em', padding: '6px 0' }}>{DAYS[d].toUpperCase()}</div>
      ))}
      {rows.map((r) =>
        days.map((d) => {
          const c = sessions.find((x) => x.weekday === d && (String(x.start_time) < '17:00' ? 0 : 1) === r);
          if (!c) return <div key={`${r}-${d}`} style={{ background: '#F7F2D4', borderRadius: 6, minHeight: 64 }} />;
          const info = classInfo[c.class_name];
          const key = slotKey(c);
          const on = picked.includes(key);
          const ok = fitsAge(info, age);
          return (
            <button
              key={key}
              type="button"
              onClick={() => onToggle(key)}
              style={{
                background: on ? C.red : '#FBF6DC', color: on ? '#fff' : C.ink, border: 'none', borderRadius: 6, padding: '8px 2px', minHeight: 64, minWidth: 0, overflow: 'hidden',
                cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em', lineHeight: 1.15, textAlign: 'center' }}>{on ? '✓ ' : ''}{info.grid}</span>
              <span style={{ fontSize: 10.5, opacity: 0.85 }}>{t12short(c.start_time)}–{t12short(c.end_time)}</span>
              {!ok && !on && <span style={{ fontSize: 9.5, color: C.faint }}>{info.ages}</span>}
            </button>
          );
        })
      )}
    </div>
  );
}

function ClassGuide() {
  return (
    <div style={{ background: '#E6EAF3', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr style={{ textAlign: 'left', color: C.ink }}>
            <th style={{ padding: '2px 8px 4px 0' }}>Class</th><th style={{ padding: '2px 8px 4px 0' }}>Age group</th><th style={{ padding: '2px 0 4px' }}>Belt range</th>
          </tr>
        </thead>
        <tbody>
          {JOIN_CLASSES.map((c) => (
            <tr key={c.name} style={{ color: C.soft }}>
              <td style={{ padding: '2px 8px 2px 0', color: C.ink }}>{c.short}</td><td style={{ padding: '2px 8px 2px 0' }}>{c.ages}</td><td style={{ padding: '2px 0' }}>{c.belts}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ color: C.faint, fontSize: 12, marginTop: 6 }}>Age groups are a guide; each student is placed by age, size and experience. Students receive a recommendation notice when they reach the age and belt level to move into a more suitable class.</div>
    </div>
  );
}

// Draw a signature with a finger or mouse; reports a PNG (or null when cleared).
function SignaturePad({ onChange }) {
  const ref = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const cv = ref.current;
    const ratio = Math.max(window.devicePixelRatio || 1, 2);
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    cv.width = w * ratio;
    cv.height = h * ratio;
    const ctx = cv.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#14213D';
  }, []);

  const pos = (e) => {
    const r = ref.current.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const down = (e) => {
    e.preventDefault();
    ref.current.setPointerCapture?.(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
    const ctx = ref.current.getContext('2d');
    ctx.beginPath();
    ctx.arc(last.current[0], last.current[1], 1.1, 0, Math.PI * 2);
    ctx.fillStyle = '#14213D';
    ctx.fill();
  };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const p = pos(e);
    const ctx = ref.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(last.current[0], last.current[1]);
    ctx.lineTo(p[0], p[1]);
    ctx.stroke();
    last.current = p;
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    setEmpty(false);
    onChange(exportPng(ref.current));
  };
  const clear = () => {
    const cv = ref.current;
    cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
    setEmpty(true);
    onChange(null);
  };

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <canvas
          ref={ref}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
          onPointerCancel={up}
          style={{ width: '100%', height: 150, display: 'block', background: '#fff', border: `1.5px dashed ${empty ? '#B9B5A8' : C.ink}`, borderRadius: 10, touchAction: 'none', cursor: 'crosshair' }}
        />
        <div style={{ position: 'absolute', left: 16, right: 16, bottom: 34, borderBottom: '1px solid #D6D2C4', pointerEvents: 'none' }} />
        {empty && <div style={{ position: 'absolute', left: 18, bottom: 40, fontSize: 22, color: '#C9C5B8', pointerEvents: 'none' }}>✕</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 13, color: C.faint }}>
        <span>Date: {new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
        {!empty && <button type="button" style={linkBtn} onClick={clear}>Clear and sign again</button>}
      </div>
    </div>
  );
}

// A small PNG of the signature: scaled down to at most 600 px wide.
function exportPng(cv) {
  const scale = Math.min(1, 600 / cv.width);
  const out = document.createElement('canvas');
  out.width = Math.round(cv.width * scale);
  out.height = Math.round(cv.height * scale);
  out.getContext('2d').drawImage(cv, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

function Rich({ text }) {
  return boldParts(text).map((p, i) => (p.bold ? <b key={i} style={{ color: C.ink }}>{p.text}</b> : <React.Fragment key={i}>{p.text}</React.Fragment>));
}
