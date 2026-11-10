import React, { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import { todayISO, addDaysISO } from '../../lib/billingDates';
import { inClass } from '../../lib/classes';
import { Card, Tag, Empty, RED, PURPLE, smallBtn } from './homeUi';
import BeltProgressCard from './BeltProgressCard';

// Start page for staff logins (front-desk iPad): today's classes, who is
// coming for a trial or makeup, birthdays, days off and the belt-test pacing.
// No money, family contact lists or admin tasks here.

const longDay = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' });
const t12 = (t) => {
  if (!t) return '';
  const [h, m] = String(t).split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};

export default function StaffHomePage({ setActiveTab }) {
  const today = todayISO();
  const [d, setD] = useState(null);

  async function load() {
    const [{ data: students }, { data: schedule }, { data: cancels }, { data: att }, { data: trials }, { data: makeups }, { data: settings }] = await Promise.all([
      supabase.from('students').select('id, name, dob, belt, class_name, class_days, classes_per_week, last_test_date, enroll_date, billing_exempt, status, medical, photo_consent').order('name'),
      supabase.from('class_schedule').select('*').eq('active', true).order('start_time'),
      supabase.from('class_cancellations').select('*').gte('date', today).lte('date', addDaysISO(today, 30)),
      supabase.from('attendance').select('student_id, class_name, status').eq('date', today),
      supabase.from('tryouts').select('student_name, date, time, class_name, status').eq('date', today),
      supabase.from('makeup_records').select('student_id, reservation_date, reservation_class_name, status').eq('reservation_date', today),
      supabase.from('invoice_settings').select('test_pacing, test_cycle_weeks').eq('id', 1).maybeSingle(),
    ]);
    setD({
      students: (students || []).filter((x) => (x.status || 'active') !== 'withdrawn'),
      schedule: schedule || [],
      cancels: cancels || [],
      att: att || [],
      trials: (trials || []).filter((t) => (t.status || 'Scheduled') === 'Scheduled'),
      makeups: (makeups || []).filter((m) => m.status !== 'completed'),
      settings: settings || {},
    });
  }

  useEffect(() => {
    load();
  }, []);

  if (!d) return <p style={{ color: '#5B5F56', fontSize: 14 }}>Loading…</p>;

  const wd = new Date(today + 'T00:00:00').getDay();
  const offToday = d.cancels.filter((c) => c.date === today);
  const allOff = offToday.some((c) => !c.class_name);
  const classes = d.schedule.filter((c) => c.weekday === wd).map((c) => ({ ...c, cancelled: allOff || offToday.some((x) => x.class_name === c.class_name) }));
  const nameOf = (id) => d.students.find((x) => x.id === id)?.name || '?';
  const bdays = d.students.filter((x) => x.dob && String(x.dob).slice(5) === today.slice(5));
  const nextOff = d.cancels.filter((c) => c.date > today).sort((a, b) => (a.date < b.date ? -1 : 1))[0];

  const items = [];
  offToday.forEach((c) => items.push({ warn: true, text: `No ${c.class_name || 'classes'} today${c.reason ? ` — ${c.reason}` : ''}` }));
  if (d.trials.length) items.push({ text: `Trial class${d.trials.length === 1 ? '' : 'es'}: ${d.trials.map((t) => `${t.student_name}${t.time ? ' ' + t12(t.time) : ''}${t.class_name ? ` (${t.class_name})` : ''}`).join(', ')}`, tab: 'tryouts', label: 'Trials' });
  if (d.makeups.length) items.push({ text: `Makeup today: ${d.makeups.map((m) => `${nameOf(m.student_id)} (${m.reservation_class_name})`).join(', ')}`, tab: 'attendance', label: 'Attendance' });
  if (bdays.length) items.push({ good: true, text: `Birthday today 🎉 ${bdays.map((x) => x.name).join(', ')}` });
  if (nextOff) items.push({ text: `Next day off: ${new Date(nextOff.date + 'T00:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })}${nextOff.class_name ? ` (${nextOff.class_name})` : ''}${nextOff.reason ? ` — ${nextOff.reason}` : ''}` });

  return (
    <>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>{longDay(today)}</h1>
          <p style={styles.subtitle}>Today at the Dojang</p>
        </div>
        <button className="dp-btn" onClick={load}>Refresh</button>
      </div>

      <div style={{ ...styles.card, marginBottom: 18 }}>
        <div style={{ padding: '11px 14px', borderBottom: items.length ? '1px solid #EDEAE0' : 'none', display: 'flex', gap: 10, alignItems: 'baseline' }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>Today</span>
          {!items.length && <span style={{ fontSize: 13, color: '#2A5A30' }}>Regular classes — nothing extra 👍</span>}
        </div>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: i < items.length - 1 ? '1px solid #F1EFE7' : 'none' }}>
            <span style={{ width: 7, height: 7, borderRadius: 99, background: it.warn ? '#D9962B' : it.good ? '#4F9A58' : '#B9B6AA', flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 14, color: it.warn ? '#854F0B' : it.good ? '#2A5A30' : '#20241F', fontWeight: it.warn ? 500 : 400 }}>{it.text}</span>
            {it.tab && <button className="dp-btn" style={smallBtn} onClick={() => setActiveTab(it.tab)}>{it.label}</button>}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 460px), 1fr))', gap: 18, alignItems: 'start' }}>
        <Card title="Today's classes" icon={Clock} action={<button className="dp-btn" style={smallBtn} onClick={() => setActiveTab('attendance')}>Attendance</button>}>
          {classes.length === 0 ? (
            <Empty>No classes on the schedule today.</Empty>
          ) : (
            <table className="dp-table">
              <tbody>
                {classes.map((c) => {
                  const roster = d.students.filter((s) => inClass(s, c.class_name)).length;
                  const here = new Set(d.att.filter((a) => a.class_name === c.class_name && a.status === 'present').map((a) => a.student_id)).size;
                  const mk = d.makeups.filter((m) => m.reservation_class_name === c.class_name).length;
                  const tr = d.trials.filter((t) => t.class_name === c.class_name).length;
                  return (
                    <tr key={c.id} style={c.cancelled ? { opacity: 0.55 } : undefined}>
                      <td style={{ whiteSpace: 'nowrap', width: 130, fontSize: 13, color: '#5B5F56' }}>{t12(c.start_time)} – {t12(c.end_time)}</td>
                      <td style={{ fontWeight: 500 }}>
                        {c.class_name}
                        {c.cancelled && <Tag c={RED}>No class</Tag>}
                        {mk > 0 && <Tag c={PURPLE}>{mk} makeup</Tag>}
                        {tr > 0 && <Tag c={PURPLE}>{tr} trial</Tag>}
                      </td>
                      <td style={{ textAlign: 'right', fontSize: 13, whiteSpace: 'nowrap' }}>{here > 0 ? <span style={{ color: '#2A5A30' }}>{here} / {roster} here</span> : <span style={{ color: "#8A8D84" }}>{roster} student{roster === 1 ? "" : "s"}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>

        <BeltProgressCard students={d.students} schedule={d.schedule} settings={d.settings} today={today} setActiveTab={setActiveTab} readOnly />
      </div>
    </>
  );
}
