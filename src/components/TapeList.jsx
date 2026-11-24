import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { TAPES, TAPE_COUNT, hasTapes, setTape } from '../lib/tapes';
import { formatDate } from '../lib/invoiceUtils';

// The 7 curriculum tapes for a student's current belt, one row each with the
// date it was earned. Tap a row to tick / untick it. (What each tape covers
// will be added here later.)
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
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, flex: 1 }}>Curriculum tapes on {belt}</h2>
        <span style={{ fontSize: 13, color: earned >= TAPE_COUNT ? '#2A5A30' : '#5B5F56', fontWeight: earned >= TAPE_COUNT ? 600 : 400 }}>{earned} of {TAPE_COUNT} earned</span>
      </div>
      {!rows ? (
        <p style={{ fontSize: 13, color: '#8A8D84' }}>Loading…</p>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {TAPES.map((t) => {
            const on = !!rows[t.id];
            return (
              <button
                key={t.id}
                type="button"
                data-tape={t.id}
                aria-pressed={on}
                disabled={!editable}
                onClick={() => toggle(t)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: `1px solid ${on ? '#CFE3D1' : '#E4E6DF'}`,
                  background: on ? '#F1F7F1' : '#fff',
                  cursor: editable ? 'pointer' : 'default',
                  fontFamily: 'inherit',
                  opacity: busy === t.id ? 0.6 : 1,
                }}
              >
                <span style={{ width: 6, alignSelf: 'stretch', minHeight: 30, borderRadius: 3, background: t.color, border: t.id === 'white' ? '1px solid #BDB9AC' : 'none' }} />
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, color: '#20241F' }}>{t.label} tape</span>
                  <span style={{ display: 'block', fontSize: 12.5, color: '#8A8D84' }}>{on ? `Earned ${formatDate(rows[t.id])}` : editable ? 'Tap when earned' : 'Not yet'}</span>
                </span>
                <span
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: on ? '#2E7D32' : 'transparent',
                    border: on ? 'none' : '1.5px dashed #CFCBBE',
                  }}
                >
                  {on && <Check size={15} color="#fff" />}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {err && <p style={{ fontSize: 12.5, color: '#9A2B2B' }}>{err}</p>}
    </div>
  );
}
