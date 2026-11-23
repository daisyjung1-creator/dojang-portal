import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { TAPES, TAPE_COUNT, hasTapes, setTape } from '../lib/tapes';

// The 7 curriculum tapes for one student's current belt. Tap a tape to tick
// or untick it (instructors and the admin).
export default function TapeTracker({ student, earned, onChange, size = 'md', editable = true, showCount = true }) {
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  if (!hasTapes(student.belt)) return <span style={{ fontSize: 12, color: '#8A8D84' }}>No tapes for {student.belt}</span>;
  const set = earned || new Set();
  const big = size === 'lg';
  const w = big ? 28 : 22;
  const h = big ? 22 : 16;
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
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: big ? 6 : 3, flexWrap: 'wrap' }} data-tapes={student.name} data-count={set.size}>
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
            style={{
              width: w,
              height: h,
              padding: 0,
              borderRadius: 3,
              cursor: editable ? 'pointer' : 'default',
              border: `1.5px ${on ? 'solid' : 'dashed'} ${on ? t.border : '#CFCBBE'}`,
              background: on ? t.color : 'transparent',
              opacity: busy === t.id ? 0.5 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {on && big && <Check size={13} color={t.text} />}
          </button>
        );
      })}
      {showCount && <span style={{ fontSize: big ? 13 : 11.5, color: set.size >= TAPE_COUNT ? '#2A5A30' : '#5B5F56', fontWeight: set.size >= TAPE_COUNT ? 600 : 400, marginLeft: 2 }}>{set.size}/{TAPE_COUNT}</span>}
      {err && <span style={{ fontSize: 11.5, color: '#9A2B2B' }}>{err}</span>}
    </span>
  );
}
