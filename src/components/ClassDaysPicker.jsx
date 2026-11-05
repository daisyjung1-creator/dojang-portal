import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { splitClasses } from '../lib/classes';

// Which scheduled classes a student actually comes to, for students in more
// classes than their plan (e.g. Int A Tue/Thu + Int/Adv Fri on 2x/week).
// value: ['2:Intermediate A', …] (weekday:class) or null = every class day.
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
let cache = null;

export function useSchedule() {
  const [rows, setRows] = useState(cache || []);
  useEffect(() => {
    if (cache) return;
    supabase
      .from('class_schedule')
      .select('*')
      .eq('active', true)
      .order('weekday')
      .order('start_time')
      .then(({ data }) => {
        cache = data || [];
        setRows(cache);
      });
  }, []);
  return rows;
}

export const slotKey = (c) => `${c.weekday}:${c.class_name}`;
const t12 = (t) => {
  const [h, m] = String(t || '').split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')}`;
};

// Scheduled sessions of the student's classes, Monday first.
export function sessionsFor(classNameField, schedule) {
  const mine = splitClasses(classNameField);
  return schedule
    .filter((c) => mine.includes(c.class_name))
    .sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7) || String(a.start_time).localeCompare(String(b.start_time)));
}

export default function ClassDaysPicker({ classNames, perWeek, value, onChange, schedule: given, compact }) {
  const loaded = useSchedule();
  const schedule = given || loaded;
  const sessions = sessionsFor(classNames, schedule);
  if (/comp team/i.test(classNames || '') || sessions.length < 2) return null;
  const all = sessions.map(slotKey);
  const chosen = value && value.length ? value.filter((k) => all.includes(k)) : all;
  const everyDay = !value || !value.length;
  const toggle = (k) => {
    const next = chosen.includes(k) ? chosen.filter((x) => x !== k) : [...chosen, k];
    onChange(next.length === 0 || next.length === all.length ? null : all.filter((x) => next.includes(x)));
  };
  const want = Number(perWeek) || 0;
  const mismatch = want && chosen.length !== want && !(everyDay && want >= all.length);
  return (
    <div style={{ marginBottom: compact ? 0 : 12 }}>
      {!compact && (
        <span style={{ display: 'block', fontSize: 12.5, color: '#5B5F56', marginBottom: 4 }}>
          Class days {everyDay ? '(all — tap to pick the days they come)' : ''}
        </span>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {sessions.map((c) => {
          const k = slotKey(c);
          const on = chosen.includes(k);
          return (
            <button
              key={c.id || k}
              type="button"
              className="dp-btn"
              onClick={() => toggle(k)}
              style={{ padding: '3px 9px', fontSize: 12, background: on ? (everyDay ? '#F1EFE7' : '#20241F') : '#fff', color: on ? (everyDay ? '#20241F' : '#fff') : '#8A8D84', borderColor: on ? (everyDay ? '#DEDACC' : '#20241F') : '#DEDACC' }}
            >
              {DAYS[c.weekday]} {t12(c.start_time)} · {c.class_name}
            </button>
          );
        })}
      </div>
      {mismatch ? (
        <div style={{ fontSize: 11.5, color: '#854F0B', marginTop: 4 }}>
          {everyDay ? `Plan is ${want}x/week but they're in ${all.length} classes a week — pick the ${want} days they come.` : `${chosen.length} day${chosen.length === 1 ? '' : 's'} picked, plan is ${want}x/week.`}
        </div>
      ) : null}
    </div>
  );
}
