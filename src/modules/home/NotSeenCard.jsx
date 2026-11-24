import React, { useMemo, useState } from 'react';
import { UserX, Phone } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { addDaysISO } from '../../lib/billingDates';
import { Card, Empty, smallBtn } from './homeUi';

// Home: active students with no class for 14+ days — reach out before they
// drift away. "Contacted" hides a student for 14 days. Students on a break,
// with a vacation / excused absence marked in that time, or not billed
// (staff, free) are left out.
export const FOLLOWUP_DAYS = 14;
const SNOOZE_DAYS = 14;
const md = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);

export function notSeen(students, recordsBy, today) {
  const cutoff = addDaysISO(today, -FOLLOWUP_DAYS);
  return students
    .filter((s) => (s.status || 'active') === 'active' && !s.billing_exempt)
    .filter((s) => !(s.hold_from && s.hold_from <= today && (!s.hold_until || s.hold_until >= today)))
    .filter((s) => !s.enroll_date || s.enroll_date <= cutoff)
    .filter((s) => !s.followup_snooze_until || s.followup_snooze_until < today)
    .map((s) => {
      const recs = recordsBy[s.id] || [];
      const told = recs.some((r) => (r.status === 'vacation' || r.status === 'excused') && r.date >= cutoff);
      if (told) return null;
      const came = recs.filter((r) => r.status === 'present' || r.status === 'double').map((r) => r.date).sort();
      const last = came[came.length - 1] || null;
      return { s, last, days: last ? daysBetween(last, today) : null };
    })
    .filter((x) => x && (!x.last || x.last < cutoff))
    .sort((a, b) => (b.days ?? 999) - (a.days ?? 999));
}

export default function NotSeenCard({ students, recordsBy, today, onChanged }) {
  const list = useMemo(() => notSeen(students, recordsBy, today), [students, recordsBy, today]);
  const [hidden, setHidden] = useState(new Set());
  const [showAll, setShowAll] = useState(false);
  const shown = list.filter((x) => !hidden.has(x.s.id));
  async function contacted(s) {
    setHidden((h) => new Set([...h, s.id]));
    await supabase.from('students').update({ followup_snooze_until: addDaysISO(today, SNOOZE_DAYS) }).eq('id', s.id);
    onChanged && onChanged();
  }
  const rows = showAll ? shown : shown.slice(0, 8);
  return (
    <Card title={`Not seen lately${shown.length ? ` (${shown.length})` : ''}`} icon={UserX}>
      {shown.length === 0 ? (
        <Empty>Every active student has come to class in the last {FOLLOWUP_DAYS} days.</Empty>
      ) : (
        <div data-testid="not-seen">
          <p style={{ margin: 0, padding: '8px 14px 4px', fontSize: 12.5, color: '#5B5F56' }}>
            Active students with no class for {FOLLOWUP_DAYS}+ days (breaks not included). A quick call often keeps them coming.
          </p>
          <table className="dp-table" style={{ width: '100%' }}>
            <tbody>
              {rows.map(({ s, last, days }) => (
                <tr key={s.id} data-student={s.name}>
                  <td style={{ fontWeight: 500 }}>
                    <a href={`#students/${s.id}`} style={{ color: '#20241F' }}>{s.name}</a>
                    <div style={{ fontSize: 12.5, color: '#8A8D84', fontWeight: 400 }}>{s.class_name || ''}</div>
                  </td>
                  <td style={{ fontSize: 12.5, whiteSpace: 'nowrap', color: days == null || days >= 28 ? '#9A2B2B' : '#854F0B' }}>
                    {last ? `${days} days · last ${md(last)}` : 'No class in 90 days'}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {s.guardian_phone && <a className="dp-btn" style={{ ...smallBtn, textDecoration: 'none' }} href={`tel:${s.guardian_phone}`} title={s.guardian_phone}><Phone size={12} /> Call</a>}{' '}
                    <button className="dp-btn" style={smallBtn} onClick={() => contacted(s)} title={`Hide for ${SNOOZE_DAYS} days`}>Contacted</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length > 8 && (
            <button className="dp-btn" style={{ ...smallBtn, margin: '6px 14px 10px' }} onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show all ${shown.length}`}</button>
          )}
        </div>
      )}
    </Card>
  );
}
