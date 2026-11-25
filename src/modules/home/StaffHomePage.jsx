import React, { useEffect, useState } from 'react';
import { Clock, RefreshCw, CalendarOff, UserPlus, RotateCcw, Cake, CalendarDays, CircleCheck } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { todayISO, addDaysISO } from '../../lib/billingDates';
import { inClass } from '../../lib/classes';
import { Card, Tag, Empty, RED, GREY, touchBtn } from './homeUi';
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

  if (!d) return <p style={{ color: 'var(--dp-ink-soft)', fontSize: 'var(--dp-text-title)', fontFamily: 'var(--dp-font)' }}>Loading…</p>;

  const wd = new Date(today + 'T00:00:00').getDay();
  const offToday = d.cancels.filter((c) => c.date === today);
  const allOff = offToday.some((c) => !c.class_name);
  const classes = d.schedule.filter((c) => c.weekday === wd).map((c) => ({ ...c, cancelled: allOff || offToday.some((x) => x.class_name === c.class_name) }));
  const nameOf = (id) => d.students.find((x) => x.id === id)?.name || '?';
  const bdays = d.students.filter((x) => x.dob && String(x.dob).slice(5) === today.slice(5));
  const nextOff = d.cancels.filter((c) => c.date > today).sort((a, b) => (a.date < b.date ? -1 : 1))[0];

  const items = [];
  offToday.forEach((c) => items.push({ tone: 'warn', icon: CalendarOff, text: `No ${c.class_name || 'classes'} today${c.reason ? ` — ${c.reason}` : ''}` }));
  if (d.trials.length) items.push({ icon: UserPlus, text: `Trial class${d.trials.length === 1 ? '' : 'es'}: ${d.trials.map((t) => `${t.student_name}${t.time ? ' ' + t12(t.time) : ''}${t.class_name ? ` (${t.class_name})` : ''}`).join(', ')}`, tab: 'tryouts', label: 'Trials' });
  if (d.makeups.length) items.push({ icon: RotateCcw, text: `Makeup today: ${d.makeups.map((m) => `${nameOf(m.student_id)} (${m.reservation_class_name})`).join(', ')}`, tab: 'attendance', label: 'Attendance' });
  if (bdays.length) items.push({ tone: 'good', icon: Cake, text: `Birthday today: ${bdays.map((x) => x.name).join(', ')}` });
  if (nextOff) items.push({ icon: CalendarDays, text: `Next day off: ${new Date(nextOff.date + 'T00:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })}${nextOff.class_name ? ` (${nextOff.class_name})` : ''}${nextOff.reason ? ` — ${nextOff.reason}` : ''}` });
  const TONE = { warn: 'var(--dp-warning)', good: 'var(--dp-success)' };

  return (
    <div style={{ fontFamily: 'var(--dp-font)', color: 'var(--dp-ink)', fontWeight: 400 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 'var(--dp-text-display)', fontWeight: 700, lineHeight: 1.15, margin: 0 }}>{longDay(today)}</h1>
          <p style={{ fontSize: 'var(--dp-text-body)', color: 'var(--dp-ink-soft)', margin: '4px 0 0' }}>Today at the dojang</p>
        </div>
        <button className="dp-btn" style={touchBtn} onClick={load}><RefreshCw size={15} aria-hidden="true" /> Refresh</button>
      </div>

      <section aria-label="Today" style={{ background: 'var(--dp-paper)', border: '1px solid var(--dp-line)', borderRadius: 'var(--dp-radius-lg)', overflow: 'hidden', marginBottom: 20 }}>
        {!items.length ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', fontSize: 'var(--dp-text-title)', color: 'var(--dp-success)' }}>
            <CircleCheck size={20} aria-hidden="true" /> Regular classes today — nothing extra
          </div>
        ) : (
          items.map((it, i) => {
            const Icon = it.icon;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', minHeight: 60, borderBottom: i < items.length - 1 ? '1px solid var(--dp-line)' : 'none', background: it.tone === 'warn' ? 'var(--dp-warning-tint)' : 'transparent' }}>
                <Icon size={20} color={TONE[it.tone] || 'var(--dp-ink-soft)'} aria-hidden="true" style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 'var(--dp-text-title)', lineHeight: 1.4, color: TONE[it.tone] || 'var(--dp-ink)', fontWeight: it.tone === 'warn' ? 600 : 400 }}>{it.text}</span>
                {it.tab && <button className="dp-btn" style={touchBtn} onClick={() => setActiveTab(it.tab)}>{it.label}</button>}
              </div>
            );
          })
        )}
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 460px), 1fr))', gap: 20, alignItems: 'start' }}>
        <Card touch title="Today's classes" icon={Clock} action={<button className="dp-btn" style={touchBtn} onClick={() => setActiveTab('attendance')}>Attendance</button>}>
          {classes.length === 0 ? (
            <Empty touch>No classes on the schedule today.</Empty>
          ) : (
            <div>
              {classes.map((c, i) => {
                const roster = d.students.filter((s) => inClass(s, c.class_name)).length;
                const here = new Set(d.att.filter((a) => a.class_name === c.class_name && a.status === 'present').map((a) => a.student_id)).size;
                const mk = d.makeups.filter((m) => m.reservation_class_name === c.class_name).length;
                const tr = d.trials.filter((t) => t.class_name === c.class_name).length;
                return (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', minHeight: 60, borderBottom: i < classes.length - 1 ? '1px solid var(--dp-line)' : 'none', background: c.cancelled ? 'var(--dp-canvas)' : 'transparent' }}>
                    <div style={{ width: 92, flexShrink: 0, fontSize: 'var(--dp-text-label)', color: 'var(--dp-ink-soft)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.35 }}>
                      {t12(c.start_time)}<br />{t12(c.end_time)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 'var(--dp-text-title)', fontWeight: 600, color: c.cancelled ? 'var(--dp-ink-soft)' : 'var(--dp-ink)', textDecoration: c.cancelled ? 'line-through' : 'none' }}>{c.class_name}</span>
                      {c.cancelled && <Tag touch c={RED}><CalendarOff size={13} aria-hidden="true" /> No class</Tag>}
                      {mk > 0 && <Tag touch c={GREY}><RotateCcw size={13} aria-hidden="true" /> {mk} makeup</Tag>}
                      {tr > 0 && <Tag touch c={GREY}><UserPlus size={13} aria-hidden="true" /> {tr} trial</Tag>}
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 'var(--dp-text-body)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                      {here > 0 ? <span style={{ color: 'var(--dp-success)', fontWeight: 600 }}>{here} / {roster} here</span> : <span style={{ color: 'var(--dp-ink-soft)' }}>{roster} student{roster === 1 ? '' : 's'}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <BeltProgressCard touch students={d.students} schedule={d.schedule} settings={d.settings} today={today} setActiveTab={setActiveTab} readOnly />
      </div>
    </div>
  );
}
