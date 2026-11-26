import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { TAPES, TAPE_COUNT, hasTapes, setTape } from '../lib/tapes';
import { formatDate } from '../lib/invoiceUtils';

// The 7 curriculum tapes for a student's current belt as small tiles with the
// date each was earned. Tap a tile to tick / untick it.
export default function TapeList({ student, onChange, editable = true }) {
  const [rows, setRows] = useState(null); // tape -> earned_on
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const belt = student.belt || 'White';
  useEffect(() => {
    supabase
      .from('student_tapes')
      .select('tape, earned_on')
      .eq('student_id', student.id)
      .eq('belt', belt)
      .then(({ data }) => setRows(Object.fromEntries((data || []).map((r) => [r.tape, r.earned_on]))));
  }, [student.id, belt]);

  if (!hasTapes(belt)) return null;
  const earned = rows ? Object.keys(rows).length : 0;

  async function toggle(t) {
    if (!editable || busy || !rows) return;
    const on = !rows[t.id];
    setBusy(t.id);
    setErr('');
    const { error } = await setTape(student, t.id, on);
    setBusy('');
    if (error) return setErr(error.message);
    const next = { ...rows };
    if (on) next[t.id] = new Date().toISOString().slice(0, 10);
    else delete next[t.id];
    setRows(next);
    onChange?.(new Set(Object.keys(next)));
  }

  return (
    <div data-testid="tape-list" data-count={earned}>
      <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 10 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0, flex: 1 }}>Curriculum tapes on {belt}</h3>
        <span style={{ fontSize: 13, color: earned >= TAPE_COUNT ? 'var(--dp-success)' : 'var(--dp-ink-soft)', fontWeight: earned >= TAPE_COUNT ? 600 : 400 }}>{earned} of {TAPE_COUNT} earned</span>
      </div>
      {!rows ? (
        <p style={{ fontSize: 13, color: 'var(--dp-ink-faint)' }}>Loading…</p>
      ) : (
        // Compact: 7 small tiles, the tape's colour as a strip on top. Tap to tick.
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(84px, 1fr))', gap: 6 }}>
          {TAPES.map((t) => {
            const on = !!rows[t.id];
            return (
              <button
                key={t.id}
                type="button"
                data-tape={t.id}
                aria-pressed={on}
                disabled={!editable}
                title={on ? `${t.label} tape — earned ${formatDate(rows[t.id])}` : `${t.label} tape — not yet`}
                onClick={() => toggle(t)}
                style={{
                  position: 'relative',
                  minHeight: 52,
                  padding: '14px 8px 6px',
                  borderRadius: 8,
                  border: `1px solid ${on ? 'var(--dp-success)' : 'var(--dp-line)'}`,
                  background: on ? 'var(--dp-success-tint)' : '#fff',
                  cursor: editable ? 'pointer' : 'default',
                  fontFamily: 'inherit',
                  textAlign: 'center',
                  overflow: 'hidden',
                  opacity: busy === t.id ? 0.6 : on ? 1 : 0.85,
                }}
              >
                <span style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 7, background: t.color, borderBottom: t.id === 'white' ? '1px solid var(--dp-line)' : 'none', opacity: on ? 1 : 0.35 }} />
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 13.5, fontWeight: 600, color: on ? 'var(--dp-success)' : 'var(--dp-ink-soft)' }}>
                  {on && <Check size={14} aria-hidden="true" />}
                  {t.label}
                </span>
                <span style={{ display: 'block', fontSize: 11.5, color: 'var(--dp-ink-faint)', marginTop: 1 }}>{on ? formatDate(rows[t.id]).replace(/, \d{4}$/, '') : '—'}</span>
              </button>
            );
          })}
        </div>
      )}
      {err && <p style={{ fontSize: 12.5, color: 'var(--dp-danger)' }}>{err}</p>}
    </div>
  );
}
