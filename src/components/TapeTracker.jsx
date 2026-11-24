import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { TAPES, TAPE_COUNT, hasTapes, setTape } from '../lib/tapes';

// The 7 curriculum tapes for one student's current belt. Tap a tape to tick
// or untick it (instructors and the admin).
// Not earned yet: the tape's own colour, faint, with a dashed edge in that colour,
// so every slot shows which tape it is.
const faint = (t) => ({ background: `${t.color}2E`, border: `dashed ${t.id === 'white' ? '#BDB9AC' : `${t.border}B3`}` });

export default function TapeTracker({ student, earned, onChange, size = 'md', editable = true, showCount = true }) {
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  if (!hasTapes(student.belt)) return <span style={{ fontSize: size === 'touch' ? 'var(--dp-text-label)' : 12, color: size === 'touch' ? 'var(--dp-ink-soft)' : '#8A8D84' }}>No tapes for {student.belt}</span>;
  const set = earned || new Set();
  const touch = size === 'touch';
  const big = size === 'lg' || touch;
  const w = touch ? 34 : big ? 28 : 22;
  const h = touch ? 24 : big ? 22 : 16;
  async function toggle(t) {
    if (!editable || busy) return;
    const on = !set.has(t.id);
    setBusy(t.id);
    setErr('');
    const { error } = await setTape(student, t.id, on);
    setBusy('');
    if (error) return setErr(error.message);
    const next = new Set(set);
    on ? next.add(t.id) : next.delete(t.id);
    onChange?.(next);
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: touch ? 2 : big ? 6 : 3, flexWrap: 'wrap' }} data-tapes={student.name} data-count={set.size}>
      {TAPES.map((t) => {
        const on = set.has(t.id);
        return (
          <button
            key={t.id}
            type="button"
            title={`${t.label} tape${on ? ' ✓' : ''}`}
            aria-label={`${t.label} tape`}
            aria-pressed={on}
            disabled={!editable}
            onClick={() => toggle(t)}
            style={touch ? {
              width: 44,
              height: 44,
              padding: 0,
              border: 'none',
              background: 'transparent',
              cursor: editable ? 'pointer' : 'default',
              opacity: busy === t.id ? 0.5 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              WebkitTapHighlightColor: 'transparent',
            } : {
              width: w,
              height: h,
              padding: 0,
              borderRadius: 3,
              cursor: editable ? 'pointer' : 'default',
              border: on ? `1.5px solid ${t.border}` : `1.5px ${faint(t).border}`,
              background: on ? t.color : faint(t).background,
              opacity: busy === t.id ? 0.5 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {touch ? (
              <span style={{ width: w, height: h, borderRadius: 4, border: on ? `2px solid ${t.border}` : `2px ${faint(t).border}`, background: on ? t.color : faint(t).background, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                {on && <Check size={15} color={t.text} strokeWidth={3} />}
              </span>
            ) : on && big && <Check size={13} color={t.text} />}
          </button>
        );
      })}
      {showCount && <span style={{ fontSize: touch ? 'var(--dp-text-body)' : big ? 13 : 11.5, fontVariantNumeric: 'tabular-nums', color: set.size >= TAPE_COUNT ? '#2A5A30' : '#5B5F56', fontWeight: set.size >= TAPE_COUNT ? 600 : 400, marginLeft: 2 }}>{set.size}/{TAPE_COUNT}</span>}
      {err && <span role="alert" style={{ fontSize: touch ? 'var(--dp-text-label)' : 11.5, color: '#9A2B2B' }}>{err}</span>}
    </span>
  );
}
