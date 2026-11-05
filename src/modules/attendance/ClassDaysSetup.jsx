import React, { useMemo, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import ClassDaysPicker, { sessionsFor } from '../../components/ClassDaysPicker';
import { clearOffDayAbsences } from '../../lib/classDays';

// Students in more weekly classes than their plan (e.g. Int A Tue/Thu + Int/Adv
// Fri on 2x/week): pick the days each one comes. Absences are only marked on
// those days, and the kiosk lists them last on other days.
export default function ClassDaysSetup({ students, schedule, onSaved, onCleared }) {
  const [showAll, setShowAll] = useState(false);
  const [msg, setMsg] = useState('');
  const active = schedule.filter((c) => c.active !== false);
  const rows = useMemo(
    () =>
      students
        .filter((s) => !s.billing_exempt && !/comp team/i.test(s.class_name || ''))
        .map((s) => ({ s, n: sessionsFor(s.class_name, active).length }))
        .filter(({ s, n }) => n >= 2 && (showAll || s.class_days?.length || (Number(s.classes_per_week) && Number(s.classes_per_week) < n)))
        .sort((a, b) => (a.s.class_days?.length ? 1 : 0) - (b.s.class_days?.length ? 1 : 0) || a.s.name.localeCompare(b.s.name)),
    [students, schedule, showAll]
  );
  const todo = rows.filter(({ s, n }) => !s.class_days?.length && Number(s.classes_per_week) < n).length;

  async function save(s, days) {
    const { error } = await supabase.from('students').update({ class_days: days }).eq('id', s.id);
    if (error) return setMsg('Could not save: ' + error.message);
    onSaved(s.id, days);
    const removed = days ? await clearOffDayAbsences(s.id, days) : 0;
    setMsg(`${s.name}: saved${removed ? ` — removed ${removed} automatic absence${removed === 1 ? '' : 's'} on days that aren't theirs` : ''}.`);
    if (removed) onCleared();
  }

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Class days per student</h3>
        {todo > 0 && <span style={{ fontSize: 12.5, color: '#854F0B' }}>{todo} to set</span>}
        <label style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5B5F56', display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show everyone in 2+ weekly classes
        </label>
      </div>
      <p style={{ fontSize: 13, color: '#5B5F56', margin: '0 0 10px' }}>
        For students in more classes a week than their plan (e.g. Int A Tue/Thu + Int/Adv Fri on 2x/week), tap the days they come. They're only marked absent on those days. Saves right away.
      </p>
      {msg && <p style={{ background: '#E8F1E9', color: '#2A5A30', padding: '6px 10px', borderRadius: 6, fontSize: 12.5, margin: '0 0 10px' }}>{msg}</p>}
      <div style={styles.card}>
        {rows.length === 0 ? (
          <p style={{ padding: 16, color: '#5B5F56', fontSize: 13.5, margin: 0 }}>Nobody needs class days set.</p>
        ) : (
          <table className="dp-table">
            <tbody>
              {rows.map(({ s }) => (
                <tr key={s.id}>
                  <td style={{ width: 210, verticalAlign: 'top' }}>
                    <div style={{ fontWeight: 500 }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: '#8A8D84' }}>{s.classes_per_week ? `${s.classes_per_week}x/week` : 'No plan count'}{s.class_days?.length ? '' : ' · all days'}</div>
                  </td>
                  <td>
                    <ClassDaysPicker compact classNames={s.class_name} perWeek={s.classes_per_week} value={s.class_days} schedule={active} onChange={(v) => save(s, v)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
