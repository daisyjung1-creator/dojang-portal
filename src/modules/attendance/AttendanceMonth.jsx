import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import { ATTENDANCE_KINDS, classCount } from '../../lib/attendanceStats';
import { todayISO } from '../../lib/billingDates';
import { splitClasses, inClass } from '../../lib/classes';

// Every student × every day of one month: who came when, at a glance.
const MARK = {
  present: { t: '✓', c: '#2A5A30', bg: '#E8F1E9' },
  double: { t: '2', c: '#1E4566', bg: '#E6F0F6' },
  private: { t: 'Pr', c: '#4B3A86', bg: '#EEEAF6' },
  absent: { t: 'A', c: '#9A2B2B', bg: '#FBEAEA' },
  excused: { t: 'E', c: '#854F0B', bg: '#FAEEDA' },
  vacation: { t: 'V', c: '#854F0B', bg: '#FAEEDA' },
};
const RANK = { double: 6, present: 5, private: 4, excused: 3, vacation: 2, absent: 1 };
const pad = (n) => String(n).padStart(2, '0');

export default function AttendanceMonth({ students, attendance, schedule, classes }) {
  const today = todayISO();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [cls, setCls] = useState('all');
  const [q, setQ] = useState('');
  const [cancels, setCancels] = useState([]);

  const [y, m] = month.split('-').map(Number);
  const nDays = new Date(y, m, 0).getDate();
  const days = Array.from({ length: nDays }, (_, i) => `${month}-${pad(i + 1)}`);
  const shift = (n) => {
    const d = new Date(y, m - 1 + n, 1);
    setMonth(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  };

  useEffect(() => {
    supabase.from('class_cancellations').select('*').gte('date', days[0]).lte('date', days[nDays - 1]).then(({ data }) => setCancels(data || []));
  }, [month]);

  // student → day → records
  const byStudentDay = useMemo(() => {
    const map = {};
    attendance.forEach((r) => {
      if (!r.date || r.date.slice(0, 7) !== month) return;
      ((map[r.student_id] = map[r.student_id] || {})[r.date] = map[r.student_id][r.date] || []).push(r);
    });
    return map;
  }, [attendance, month]);

  const rows = useMemo(() => {
    const k = q.trim().toLowerCase();
    return students
      .filter((s) => (cls === 'all' || inClass(s, cls)) && (!k || s.name.toLowerCase().includes(k)))
      .map((s) => {
        const mine = splitClasses(s.class_name);
        const weekdays = new Set(schedule.filter((c) => c.active !== false && mine.includes(c.class_name) && (cls === 'all' || c.class_name === cls) && (!s.class_days?.length || s.class_days.includes(`${c.weekday}:${c.class_name}`))).map((c) => c.weekday));
        const recs = Object.values(byStudentDay[s.id] || {}).flat().filter((r) => cls === 'all' || r.class_name === cls || r.status === 'private');
        return { s, weekdays, total: classCount(recs.filter((r) => r.status !== 'private')), absent: recs.filter((r) => r.status === 'absent').length };
      });
  }, [students, cls, q, schedule, byStudentDay]);

  const dayInfo = days.map((d) => {
    const wd = new Date(d + 'T00:00:00').getDay();
    return { d, wd, n: Number(d.slice(8)), weekend: wd === 0 || wd === 6, allCancelled: cancels.some((c) => c.date === d && !c.class_name) };
  });
  const title = new Date(`${month}-01T00:00:00`).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
  const cellW = 26;

  return (
    <>
      <div style={{ ...styles.filterBar, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="dp-btn" style={{ padding: 6 }} aria-label="Previous month" onClick={() => shift(-1)}><ChevronLeft size={15} /></button>
        <div style={{ minWidth: 130, textAlign: 'center', fontWeight: 500 }}>{title}</div>
        <button className="dp-btn" style={{ padding: 6 }} aria-label="Next month" onClick={() => shift(1)}><ChevronRight size={15} /></button>
        {month !== today.slice(0, 7) && <button className="dp-btn" onClick={() => setMonth(today.slice(0, 7))}>This month</button>}
        <select className="dp-select" value={cls} onChange={(e) => setCls(e.target.value)}>
          <option value="all">All classes</option>
          {classes.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <div style={{ ...styles.searchBox, minWidth: 200 }}>
          <Search size={15} color="#8A8D84" />
          <input style={{ border: 'none', outline: 'none', padding: '6px 0', fontSize: 14, flex: 1, fontFamily: 'inherit' }} placeholder="Student…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div style={{ ...styles.card, overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: 12.5, minWidth: '100%' }}>
          <thead>
            <tr>
              <th style={{ ...stickyCell, textAlign: 'left', padding: '8px 10px', fontWeight: 500, color: '#5B5F56', borderBottom: '1px solid #EDEAE0', zIndex: 2 }}>{rows.length} students</th>
              {dayInfo.map(({ d, wd, n, weekend }) => (
                <th key={d} style={{ width: cellW, minWidth: cellW, padding: '4px 0', fontWeight: d === today ? 700 : 400, color: d === today ? '#fff' : weekend ? '#A7AAA1' : '#5B5F56', background: d === today ? '#20241F' : weekend ? '#FAF9F5' : '#fff', borderBottom: '1px solid #EDEAE0', textAlign: 'center' }}>
                  <div style={{ fontSize: 10 }}>{'SMTWTFS'[wd]}</div>
                  <div>{n}</div>
                </th>
              ))}
              <th style={{ padding: '4px 10px', fontWeight: 500, color: '#5B5F56', borderBottom: '1px solid #EDEAE0', textAlign: 'right', whiteSpace: 'nowrap' }}>Classes</th>
              <th style={{ padding: '4px 10px', fontWeight: 500, color: '#5B5F56', borderBottom: '1px solid #EDEAE0', textAlign: 'right' }}>Absent</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ s, weekdays, total, absent }) => (
              <tr key={s.id}>
                <td style={{ ...stickyCell, padding: '5px 10px', borderBottom: '1px solid #F1EFE7', whiteSpace: 'nowrap' }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: '#8A8D84', maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.class_name || '—'}{s.classes_per_week ? ` · ${s.classes_per_week}x/wk` : ''}{s.class_days?.length ? ` · ${[...new Set(s.class_days.map((k) => 'SMTWTFS'[Number(k.split(':')[0])]))].join('')}` : ''}</div>
                </td>
                {dayInfo.map(({ d, wd, weekend, allCancelled }) => {
                  const recs = (byStudentDay[s.id]?.[d] || []).filter((r) => cls === 'all' || r.class_name === cls || r.status === 'private');
                  const best = recs.slice().sort((a, b) => (RANK[b.status] || 0) - (RANK[a.status] || 0))[0];
                  const came = classCount(recs);
                  const mk = best && MARK[best.status === 'present' && came >= 2 ? 'double' : best.status];
                  const classDay = weekdays.has(wd);
                  const cancelled = allCancelled || cancels.some((c) => c.date === d && splitClasses(s.class_name).includes(c.class_name));
                  return (
                    <td
                      key={d}
                      title={recs.length ? recs.map((r) => `${r.class_name}: ${ATTENDANCE_KINDS[r.status]?.label || r.status}${r.is_makeup ? ' (makeup)' : ''}`).join('\n') : cancelled ? 'Cancelled' : classDay ? 'Class day' : ''}
                      style={{ textAlign: 'center', padding: 0, height: 34, borderBottom: '1px solid #F1EFE7', background: d === today ? '#F3F1EA' : weekend ? '#FAF9F5' : '#fff' }}
                    >
                      {mk ? (
                        <span style={{ display: 'inline-block', minWidth: 20, lineHeight: '20px', borderRadius: 4, fontSize: 11.5, fontWeight: 600, color: mk.c, background: mk.bg }}>{mk.t}</span>
                      ) : cancelled ? (
                        <span style={{ color: '#C9C6BA', fontSize: 11 }}>✕</span>
                      ) : classDay && d < today ? (
                        <span style={{ color: '#C9C6BA' }}>·</span>
                      ) : null}
                    </td>
                  );
                })}
                <td style={{ textAlign: 'right', padding: '0 10px', borderBottom: '1px solid #F1EFE7', fontWeight: 600 }}>{total}</td>
                <td style={{ textAlign: 'right', padding: '0 10px', borderBottom: '1px solid #F1EFE7', color: absent ? '#9A2B2B' : '#C9C6BA' }}>{absent}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12, color: '#5B5F56', marginTop: 8 }}>
        {[['present', 'Came'], ['double', 'Two classes'], ['absent', 'Absent'], ['excused', 'Excused'], ['vacation', 'Vacation'], ['private', 'Private']].map(([k, l]) => (
          <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ display: 'inline-block', minWidth: 18, lineHeight: '18px', textAlign: 'center', borderRadius: 4, fontSize: 11, fontWeight: 600, color: MARK[k].c, background: MARK[k].bg }}>{MARK[k].t}</span>{l}
          </span>
        ))}
        <span><span style={{ color: '#A7AAA1' }}>·</span> class day, no record</span>
        <span><span style={{ color: '#A7AAA1' }}>✕</span> cancelled</span>
      </div>
    </>
  );
}

const stickyCell = { position: 'sticky', left: 0, background: '#fff', zIndex: 1, borderRight: '1px solid #EDEAE0', minWidth: 170 };
