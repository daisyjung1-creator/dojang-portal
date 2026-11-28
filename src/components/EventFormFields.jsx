import React, { useEffect, useRef, useState } from 'react';

// Google-Forms-style questions for event sign-ups, plus a hand-drawn
// signature pad. Used by the parent portal (filling in) and the admin
// Events page (preview + reading answers).

export const QUESTION_TYPES = [
  { value: 'short', label: 'Short answer' },
  { value: 'paragraph', label: 'Paragraph' },
  { value: 'choice', label: 'Multiple choice' },
  { value: 'checkboxes', label: 'Checkboxes' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'date', label: 'Date' },
];
export const HAS_OPTIONS = ['choice', 'checkboxes', 'dropdown'];

// Question types whose answers the admin can show to parents.
export const SHAREABLE = ['short', 'choice', 'dropdown', 'checkboxes'];

// All values in one answer (per-child answers and checkbox lists flattened).
function flat(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v.flatMap(flat);
  if (typeof v === 'object') return Object.values(v).flatMap(flat);
  const t = String(v).trim();
  return t ? [t] : [];
}
const norm = (t) => t.toLowerCase().replace(/\s+/g, ' ').trim();

// Tally repeated free-text answers: [{ text, n }], first spelling kept.
function tally(list) {
  const m = new Map();
  for (const t of list) {
    const k = norm(t);
    if (m.has(k)) m.get(k).n += 1;
    else m.set(k, { text: t, n: 1 });
  }
  return [...m.values()];
}

// Summary of shared answers for parents. rows = answer objects from
// event_shared_answers (no family info). Returns one block per shared question:
// { q, total, groups: [{ name, count, items: [{ text, n }], needed }], items }
export function sharedSummary(form, rows) {
  const list = form || [];
  const shared = list.filter((q) => q.share && SHAREABLE.includes(q.type));
  const groupTargets = new Set(shared.map((q) => q.group_by).filter(Boolean));
  const out = [];
  for (const q of shared) {
    if (groupTargets.has(q.id) && shared.some((x) => x.group_by === q.id && x.id !== q.id)) continue; // shown inside the grouped question
    const g = q.type === 'short' && q.group_by ? list.find((x) => x.id === q.group_by && HAS_OPTIONS.includes(x.type)) : null;
    let groups = [];
    let items = [];
    if (g) {
      const by = new Map((g.options || []).map((o) => [o, []]));
      const other = [];
      for (const r of rows || []) {
        const vals = flat(r?.[q.id]);
        if (!vals.length) continue;
        const key = flat(r?.[g.id])[0];
        (key && by.has(key) ? by.get(key) : other).push(...vals);
      }
      groups = [...by.entries()].map(([name, v]) => ({ name, count: v.length, items: tally(v) }));
      if (other.length) groups.push({ name: 'Other', count: other.length, items: tally(other) });
    } else if (HAS_OPTIONS.includes(q.type)) {
      const all = (rows || []).flatMap((r) => flat(r?.[q.id]));
      groups = (q.options || []).map((o) => ({ name: o, count: all.filter((x) => x === o).length, items: [] }));
    } else {
      items = tally((rows || []).flatMap((r) => flat(r?.[q.id])));
    }
    const total = groups.length ? groups.reduce((t, x) => t + x.count, 0) : items.reduce((t, x) => t + x.n, 0);
    // Nudge toward the options that are falling behind.
    const max = Math.max(0, ...groups.map((x) => x.count));
    groups.forEach((x) => { x.needed = total >= 3 && max - x.count >= 2; });
    out.push({ q, group: g, total, groups, items });
  }
  return out;
}

// Free-text answers to shared questions that match one already given.
export function sharedDuplicates(form, rows, answers) {
  const hits = [];
  for (const q of (form || []).filter((x) => x.share && x.type === 'short')) {
    const seen = new Set((rows || []).flatMap((r) => flat(r?.[q.id])).map(norm));
    for (const v of flat(answers?.[q.id])) if (seen.has(norm(v))) hits.push(v);
  }
  return [...new Set(hits)];
}

export const DEFAULT_SIGNATURE_TEXT =
  'I give permission for my child(ren) to take part in this event. I understand that taekwondo and event activities involve physical activity and a risk of injury. In an emergency, I authorize the instructors of Champion Hankook Taekwondo to arrange medical care for my child. I confirm the information I have given is correct.';

export const newQuestion = () => ({ id: 'q' + Math.random().toString(36).slice(2, 9), type: 'short', label: '', help: '', required: false, per_child: false, options: [] });

const filled = (v) => (Array.isArray(v) ? v.length > 0 : v != null && String(v).trim() !== '');

// Value for one question (and child, for per-child questions).
export const getAnswer = (answers, q, kidId) => (q.per_child ? answers?.[q.id]?.[kidId] : answers?.[q.id]);
export function setAnswer(answers, q, kidId, value) {
  if (!q.per_child) return { ...answers, [q.id]: value };
  return { ...answers, [q.id]: { ...(answers?.[q.id] || {}), [kidId]: value } };
}

// First problem with the answers, or '' if all required ones are filled.
export function checkAnswers(form, kids, answers) {
  for (const q of form || []) {
    if (!q.required) continue;
    if (q.per_child) {
      for (const k of kids) if (!filled(getAnswer(answers, q, k.id))) return `Please answer "${q.label}" for ${k.name.split(' ')[0]}.`;
    } else if (!filled(getAnswer(answers, q))) return `Please answer "${q.label}".`;
  }
  return '';
}

// Plain-text answer for lists / CSV.
export function answerText(q, answers, kids) {
  const one = (v) => (Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v));
  if (!q.per_child) return one(answers?.[q.id]);
  return (kids || [])
    .map((k) => {
      const v = one(answers?.[q.id]?.[k.id]);
      return v ? `${k.name.split(' ')[0]}: ${v}` : '';
    })
    .filter(Boolean)
    .join('; ');
}

function Input({ q, value, onChange, st, name }) {
  const base = st.input;
  if (q.type === 'paragraph') return <textarea style={{ ...base, minHeight: 80 }} value={value || ''} maxLength={2000} onChange={(e) => onChange(e.target.value)} aria-label={name} />;
  if (q.type === 'date') return <input type="date" style={{ ...base, maxWidth: 220 }} value={value || ''} onChange={(e) => onChange(e.target.value)} aria-label={name} />;
  if (q.type === 'dropdown')
    return (
      <select style={{ ...base, maxWidth: 360 }} value={value || ''} onChange={(e) => onChange(e.target.value)} aria-label={name}>
        <option value="">Choose…</option>
        {q.options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  if (q.type === 'choice')
    return (
      <div role="radiogroup" aria-label={name}>
        {q.options.map((o) => (
          <label key={o} style={st.option}>
            <input type="radio" name={name} checked={value === o} onChange={() => onChange(o)} /> {o}
          </label>
        ))}
      </div>
    );
  if (q.type === 'checkboxes') {
    const arr = Array.isArray(value) ? value : [];
    return (
      <div aria-label={name}>
        {q.options.map((o) => (
          <label key={o} style={st.option}>
            <input type="checkbox" checked={arr.includes(o)} onChange={(e) => onChange(e.target.checked ? [...arr, o] : arr.filter((x) => x !== o))} /> {o}
          </label>
        ))}
      </div>
    );
  }
  return <input style={base} value={value || ''} maxLength={300} onChange={(e) => onChange(e.target.value)} aria-label={name} />;
}

const defaultSt = {
  input: { width: '100%', boxSizing: 'border-box', padding: '9px 10px', border: '1px solid #E6E3DA', borderRadius: 8, fontSize: 15, fontFamily: 'inherit', background: '#fff' },
  option: { display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 15, cursor: 'pointer' },
};

// The questions, each in its own card like Google Forms.
export function FormQuestions({ form, kids, answers, onChange, st: stIn }) {
  const st = { ...defaultSt, ...(stIn || {}) };
  if (!form?.length) return null;
  return (
    <div data-testid="event-form">
      {form.map((q, i) => (
        <div key={q.id} style={{ border: '1px solid var(--dp-line)', borderRadius: 12, padding: '12px 14px', margin: '10px 0', background: '#fff' }} data-question={q.label}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--dp-ink)' }}>
            {q.label || `Question ${i + 1}`}
            {q.required && <span style={{ color: 'var(--dp-danger)' }} aria-hidden="true"> *</span>}
          </div>
          {q.help && <div style={{ fontSize: 13, color: 'var(--dp-ink-soft)', marginTop: 2, whiteSpace: 'pre-wrap' }}>{q.help}</div>}
          <div style={{ marginTop: 8 }}>
            {q.per_child ? (
              kids.length ? (
                kids.map((k) => (
                  <div key={k.id} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--dp-ink-soft)', marginBottom: 3 }}>{k.name}</div>
                    <Input q={q} st={st} name={`${q.label} — ${k.name}`} value={getAnswer(answers, q, k.id)} onChange={(v) => onChange(setAnswer(answers, q, k.id, v))} />
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 13, color: 'var(--dp-ink-faint)' }}>Choose who is coming first — this is asked for each child.</div>
              )
            ) : (
              <Input q={q} st={st} name={q.label} value={getAnswer(answers, q)} onChange={(v) => onChange(setAnswer(answers, q, null, v))} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// Finger / mouse signature. onChange(dataUrl | null).
export function SignaturePad({ onChange, height = 150 }) {
  const ref = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);
  const inked = useRef(0);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = ref.current;
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const w = c.offsetWidth || 500;
    c.width = w * ratio;
    c.height = height * ratio;
    const ctx = c.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111';
  }, [height]);

  const pos = (e) => {
    const r = ref.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  function down(e) {
    e.preventDefault();
    ref.current.setPointerCapture?.(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
    const ctx = ref.current.getContext('2d');
    ctx.beginPath();
    ctx.arc(last.current.x, last.current.y, 1.1, 0, Math.PI * 2);
    ctx.fillStyle = '#111';
    ctx.fill();
  }
  function move(e) {
    if (!drawing.current) return;
    e.preventDefault();
    const p = pos(e);
    const ctx = ref.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    inked.current += Math.hypot(p.x - last.current.x, p.y - last.current.y);
    last.current = p;
  }
  function up() {
    if (!drawing.current) return;
    drawing.current = false;
    // a real signature, not a dot or a tiny tick
    if (inked.current > 40) {
      setEmpty(false);
      onChange(toPng());
    }
  }
  // white background so it prints and shows on dark screens
  function toPng() {
    const c = ref.current;
    const out = document.createElement('canvas');
    out.width = c.width;
    out.height = c.height;
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(c, 0, 0);
    return out.toDataURL('image/png');
  }
  function clear() {
    const c = ref.current;
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
    inked.current = 0;
    setEmpty(true);
    onChange(null);
  }
  return (
    <div>
      <div style={{ position: 'relative', border: '1.5px solid #BDB9AC', borderRadius: 10, background: '#fff', touchAction: 'none' }}>
        <canvas
          ref={ref}
          data-testid="signature-pad"
          aria-label="Sign here"
          style={{ width: '100%', height, display: 'block', cursor: 'crosshair', touchAction: 'none' }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
          onPointerCancel={up}
        />
        <div style={{ position: 'absolute', left: 14, right: 14, bottom: 28, borderBottom: '1px solid #D9D6CC', pointerEvents: 'none' }} />
        {empty && <div style={{ position: 'absolute', left: 16, bottom: 8, fontSize: 12, color: 'var(--dp-ink-faint)', pointerEvents: 'none' }}>✕ Sign here with your finger or mouse</div>}
      </div>
      <button type="button" onClick={clear} style={{ marginTop: 6, background: 'none', border: 'none', color: 'var(--dp-ink-soft)', fontSize: 13, textDecoration: 'underline', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
        Clear signature
      </button>
    </div>
  );
}
