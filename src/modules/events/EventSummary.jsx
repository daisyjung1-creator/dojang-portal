import React, { useMemo, useState } from 'react';
import { styles } from '../../lib/uiStyles';
import { getAnswer, HAS_OPTIONS } from '../../components/EventFormFields';

// Event overview: who's coming (ring chart) and a tally of the form answers.
// Colours: categorical slots 1–2 (blue, orange) for students / guests, a
// neutral grey for open spots. Text never takes the series colour.
const C = { students: '#257de0', guests: '#f47230', open: '#E2DFD6' };

function Donut({ parts, total, center, sub }) {
  const [hover, setHover] = useState(null);
  const R = 52;
  const W = 16;
  const circ = 2 * Math.PI * R;
  const sum = parts.reduce((t, p) => t + p.value, 0) || 1;
  const gap = parts.filter((p) => p.value > 0).length > 1 ? 2 : 0; // 2px surface gap between segments
  let at = 0;
  return (
    <div style={{ position: 'relative', width: 140, height: 140, flexShrink: 0 }}>
      <svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label={`${center} ${sub}`}>
        <g transform="rotate(-90 70 70)">
          {total === 0 && <circle cx="70" cy="70" r={R} fill="none" stroke={C.open} strokeWidth={W} />}
          {parts.map((p) => {
            if (!p.value) return null;
            const len = (p.value / sum) * circ;
            const el = (
              <circle
                key={p.key}
                cx="70" cy="70" r={R} fill="none" stroke={p.color} strokeWidth={hover === p.key ? W + 4 : W}
                strokeDasharray={`${Math.max(len - gap, 0.5)} ${circ}`} strokeDashoffset={-at}
                onMouseEnter={() => setHover(p.key)} onMouseLeave={() => setHover(null)} onClick={() => setHover(hover === p.key ? null : p.key)}
                style={{ cursor: 'default', transition: 'stroke-width 120ms' }}
              >
                <title>{`${p.label}: ${p.value}`}</title>
              </circle>
            );
            at += len;
            return el;
          })}
        </g>
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        {hover ? (
          <>
            <div style={{ fontSize: 24, fontWeight: 600, color: 'var(--dp-ink)', fontVariantNumeric: 'tabular-nums' }}>{parts.find((p) => p.key === hover)?.value}</div>
            <div style={{ fontSize: 11.5, color: 'var(--dp-ink-soft)' }}>{parts.find((p) => p.key === hover)?.label}</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--dp-ink)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{center}</div>
            <div style={{ fontSize: 11.5, color: 'var(--dp-ink-soft)', marginTop: 3 }}>{sub}</div>
          </>
        )}
      </div>
    </div>
  );
}

// One question: options as ranked bars (one hue), or the written answers.
function QuestionTally({ q, rows, kidsOf }) {
  const values = [];
  rows.forEach((r) => {
    const kids = kidsOf(r);
    const push = (v, who) => {
      if (v == null || v === '' || (Array.isArray(v) && !v.length)) return;
      (Array.isArray(v) ? v : [v]).forEach((x) => values.push({ v: String(x), who }));
    };
    if (q.per_child) kids.forEach((k) => push(getAnswer(r.answers, q, k.id), k.name));
    else push(getAnswer(r.answers, q), kids.map((k) => k.name).join(', '));
  });
  const answered = q.per_child ? values.length : new Set(values.map((x) => x.who)).size;
  if (HAS_OPTIONS.includes(q.type) || q.type === 'date') {
    const counts = {};
    values.forEach((x) => { counts[x.v] = (counts[x.v] || 0) + 1; });
    const keys = q.type === 'date' ? Object.keys(counts).sort() : [...new Set([...(q.options || []), ...Object.keys(counts)])];
    const list = keys.map((k) => [k, counts[k] || 0]);
    if (q.type !== 'date') list.sort((a, b) => b[1] - a[1]);
    const max = Math.max(1, ...list.map(([, n]) => n));
    return (
      <div>
        {list.map(([k, n]) => (
          <div key={k} title={`${k}: ${n}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 38%) 1fr 28px', alignItems: 'center', gap: 8, fontSize: 13, margin: '3px 0' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--dp-ink)' }}>{k}</span>
            <span style={{ height: 10, background: 'var(--dp-canvas)', borderRadius: 4 }}>
              <span style={{ display: 'block', height: 10, width: `${(n / max) * 100}%`, minWidth: n ? 4 : 0, background: C.students, borderRadius: 4 }} />
            </span>
            <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--dp-ink)' }}>{n}</span>
          </div>
        ))}
        <div style={{ fontSize: 12, color: 'var(--dp-ink-faint)', marginTop: 2 }}>{answered} answered{q.type === 'checkboxes' ? ' · more than one could be picked' : ''}</div>
      </div>
    );
  }
  return (
    <div>
      {values.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--dp-ink-faint)' }}>No answers yet.</div>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, maxHeight: 160, overflowY: 'auto' }}>
          {values.map((x, i) => <li key={i}><span style={{ color: 'var(--dp-ink-soft)' }}>{x.who}:</span> {x.v}</li>)}
        </ul>
      )}
      <div style={{ fontSize: 12, color: 'var(--dp-ink-faint)', marginTop: 2 }}>{answered} answered</div>
    </div>
  );
}

export default function EventSummary({ event: e, students: studentCount, guests, rows, kidsOf }) {
  const form = Array.isArray(e.form) ? e.form : [];
  const cap = Number(e.capacity) || 0;
  const total = studentCount + guests;
  const parts = useMemo(() => [
    { key: 'students', label: 'Students', value: studentCount, color: C.students },
    { key: 'guests', label: 'Guests', value: guests, color: C.guests },
    ...(cap ? [{ key: 'open', label: 'Spots left', value: Math.max(cap - total, 0), color: C.open }] : []),
  ], [studentCount, guests, cap, total]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: form.length ? 'minmax(260px, 320px) 1fr' : 'minmax(260px, 420px)', gap: 12, marginBottom: 12 }} className="dp-event-summary">
      <div style={{ ...styles.card, padding: 14, display: 'flex', gap: 16, alignItems: 'center' }}>
        <Donut parts={parts} total={total} center={total} sub={cap ? `of ${cap} coming` : 'coming'} />
        <div style={{ fontSize: 13 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Total people</div>
          {parts.map((p) => (
            <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '3px 0' }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: p.color, flexShrink: 0 }} />
              <span style={{ color: 'var(--dp-ink-soft)', flex: 1 }}>{p.label}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{p.value}</span>
            </div>
          ))}
          {rows && <div style={{ fontSize: 12, color: 'var(--dp-ink-faint)', marginTop: 6 }}>{rows.length} form{rows.length === 1 ? '' : 's'} filled in</div>}
        </div>
      </div>
      {form.length > 0 && (
        <div style={{ ...styles.card, padding: 14 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Answers summary</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
            {form.map((q) => (
              <div key={q.id}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{q.label}{q.per_child ? <span style={{ fontWeight: 400, color: 'var(--dp-ink-faint)' }}> · per child</span> : null}</div>
                {rows ? <QuestionTally q={q} rows={rows} kidsOf={kidsOf} /> : <div style={{ fontSize: 13, color: 'var(--dp-ink-faint)' }}>Loading…</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
