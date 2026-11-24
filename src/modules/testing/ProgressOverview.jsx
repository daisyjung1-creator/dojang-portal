import React, { useEffect, useMemo, useState } from 'react';
import { Search, ChevronRight, Award, CalendarDays } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import { BELTS } from '../../lib/constants';
import { fetchAll } from '../invoices/api';
import { MIN_CLASSES, countStart, classesSince, nextBelt, beltMeta, beltIndex } from '../../lib/beltTesting';
import { inClass, DOJANG_CLASSES } from '../../lib/classes';
import { formatDate, localISO } from '../../lib/invoiceUtils';
import { loadTapes, hasTapes, TAPE_COUNT } from '../../lib/tapes';
import TapeTracker from '../../components/TapeTracker';

// Belt Testing — first screen: every active student, their curriculum tapes
// (tick them here) and classes since the last test. "Open test" goes on to the
// test list for the next test. Staff logins get the same screen ("Tapes"),
// without the test buttons.
const daysTo = (iso) => Math.round((new Date(iso + 'T12:00:00') - new Date(localISO() + 'T12:00:00')) / 864e5);

export default function ProgressOverview({ onOpenTest, onNewTest, isAdmin = true }) {
  const [students, setStudents] = useState(null);
  const [att, setAtt] = useState([]);
  const [tests, setTests] = useState([]);
  const [tapes, setTapes] = useState({});
  const [entryCount, setEntryCount] = useState(null);
  const [q, setQ] = useState('');
  const [cls, setCls] = useState('all');
  const [belt, setBelt] = useState('all');
  const [show, setShow] = useState('all');

  useEffect(() => {
    (async () => {
      const [{ data: st }, { data: t }] = await Promise.all([
        fetchAll(() => supabase.from('students').select('id, name, belt, dob, status, class_name, enroll_date, last_test_date, billing_exempt, hold_from, hold_until').order('name')),
        supabase.from('belt_tests').select('id, test_date, title').order('test_date'),
      ]);
      const active = (st || []).filter((s) => (s.status || 'active') !== 'withdrawn');
      const from = active.map(countStart).sort()[0] || '2000-01-01';
      const [{ data: a }, tp] = await Promise.all([
        fetchAll(() => supabase.from('attendance').select('student_id, date, status').gte('date', from)),
        loadTapes(active),
      ]);
      setAtt(a || []);
      setTapes(tp);
      setTests(t || []);
      setStudents(active);
    })();
  }, []);

  const today = localISO();
  const next = tests.find((t) => t.test_date >= today) || null;
  const others = tests.filter((t) => t !== next).slice().reverse();
  useEffect(() => {
    if (!next || !isAdmin) return;
    supabase.from('belt_test_entries').select('id', { count: 'exact', head: true }).eq('test_id', next.id).then(({ count }) => setEntryCount(count ?? 0));
  }, [next?.id]);

  const attBy = useMemo(() => {
    const m = {};
    att.forEach((r) => (m[r.student_id] ||= []).push(r));
    return m;
  }, [att]);

  const rows = useMemo(
    () =>
      (students || []).map((s) => {
        const n = classesSince(s, attBy[s.id] || []);
        const tp = tapes[s.id] || new Set();
        const taped = hasTapes(s.belt);
        const tapesDone = !taped || tp.size >= TAPE_COUNT;
        const enough = n >= MIN_CLASSES;
        return { s, n, tp, taped, tapesDone, enough, ready: tapesDone && enough };
      }),
    [students, attBy, tapes]
  );

  const classes = useMemo(() => DOJANG_CLASSES.filter((c) => rows.some((r) => inClass(r.s, c))), [rows]);
  const filtered = rows
    .filter((r) => {
      if (cls !== 'all' && !inClass(r.s, cls)) return false;
      if (belt === 'color' && !r.taped) return false;
      if (belt === 'black' && r.taped) return false;
      if (show === 'ready' && !r.ready) return false;
      if (show === 'tapes' && (r.tapesDone || !r.taped)) return false;
      if (show === 'classes' && r.enough) return false;
      const k = q.trim().toLowerCase();
      return !k || r.s.name.toLowerCase().includes(k);
    })
    .sort((a, b) => beltIndex(a.s.belt) - beltIndex(b.s.belt) || a.s.name.localeCompare(b.s.name));

  const colour = rows.filter((r) => r.taped);
  const stats = {
    active: rows.length,
    allTapes: colour.filter((r) => r.tp.size >= TAPE_COUNT).length,
    avg: colour.length ? (colour.reduce((t, r) => t + r.tp.size, 0) / colour.length).toFixed(1) : '0',
    enough: rows.filter((r) => r.enough).length,
    ready: rows.filter((r) => r.ready).length,
  };
  const setOne = (id, set) => setTapes((m) => ({ ...m, [id]: set }));

  return (
    <>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>{isAdmin ? 'Belt Testing' : 'Tapes'}</h1>
          <p style={styles.subtitle}>Every active student: curriculum tapes (tap to tick) and classes since their last test · {MIN_CLASSES} classes to be eligible</p>
        </div>
        {isAdmin && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {others.length > 0 && (
              <select className="dp-select" aria-label="Open another test" value="" onChange={(e) => e.target.value && onOpenTest(e.target.value)}>
                <option value="">Other tests…</option>
                {others.map((t) => <option key={t.id} value={t.id}>{formatDate(t.test_date)}{t.title ? ` — ${t.title}` : ''}</option>)}
              </select>
            )}
            <button className="dp-btn" onClick={onNewTest}>New test</button>
          </div>
        )}
      </div>

      {isAdmin && (
        <div style={{ ...styles.card, padding: '14px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <CalendarDays size={22} color="#BE1C21" />
          <div style={{ flex: '1 1 240px' }}>
            {next ? (
              <>
                <div style={{ fontSize: 15, fontWeight: 600 }}>Next test: {next.title || 'Belt testing'} — {formatDate(next.test_date)}</div>
                <div style={{ fontSize: 13, color: '#5B5F56' }}>
                  {daysTo(next.test_date) === 0 ? 'Today' : `In ${daysTo(next.test_date)} day${daysTo(next.test_date) === 1 ? '' : 's'}`}
                  {entryCount != null && ` · ${entryCount} on the test list`} · {stats.ready} ready now (all tapes + {MIN_CLASSES} classes)
                </div>
              </>
            ) : (
              <div style={{ fontSize: 14, color: '#5B5F56' }}>No upcoming test. Click “New test” to set the date.</div>
            )}
          </div>
          {next && (
            <button className="dp-btn dp-btn-primary" onClick={() => onOpenTest(next.id)}>
              <Award size={15} /> Open test <ChevronRight size={15} />
            </button>
          )}
        </div>
      )}

      <div className="dp-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
        <Metric label="Active students" value={stats.active} />
        <Metric label="Avg. tapes (colour belts)" value={`${stats.avg} / ${TAPE_COUNT}`} />
        <Metric label="All 7 tapes" value={stats.allTapes} onClick={() => setShow('all')} />
        <Metric label={`${MIN_CLASSES}+ classes`} value={stats.enough} />
        <Metric label="Ready to test" value={stats.ready} tone="good" onClick={() => setShow('ready')} />
      </div>

      <div style={{ ...styles.filterBar, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={styles.searchBox}>
          <Search size={15} color="#8A8D84" />
          <input style={{ border: 'none', outline: 'none', padding: '6px 0', fontSize: 14, flex: 1, fontFamily: 'inherit' }} placeholder="Find student…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="dp-select" aria-label="Class" value={cls} onChange={(e) => setCls(e.target.value)}>
          <option value="all">All classes</option>
          {classes.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="dp-select" aria-label="Belts" value={belt} onChange={(e) => setBelt(e.target.value)}>
          <option value="all">All belts</option>
          <option value="color">Colour belts</option>
          <option value="black">Black stripes & black belts</option>
        </select>
        <select className="dp-select" aria-label="Show" value={show} onChange={(e) => setShow(e.target.value)}>
          <option value="all">Everyone</option>
          <option value="ready">Ready to test</option>
          <option value="tapes">Still need tapes</option>
          <option value="classes">Not enough classes yet</option>
        </select>
      </div>

      <div style={styles.card}>
        {students === null ? (
          <p style={{ padding: 20, color: '#5B5F56', fontSize: 14 }}>Loading…</p>
        ) : filtered.length === 0 ? (
          <p style={{ padding: 20, color: '#5B5F56', fontSize: 14 }}>No students match.</p>
        ) : (
          <table className="dp-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Belt</th>
                <th>Tapes</th>
                <th style={{ textAlign: 'right' }}>Classes since test</th>
                <th>Next belt</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ s, n, tp, ready, enough }) => {
                const m = beltMeta(s.belt);
                return (
                  <tr key={s.id} className="dp-row" data-student={s.name}>
                    <td style={{ fontWeight: 500 }}>
                      {isAdmin ? (
                        <a href={`#students/${s.id}`} style={{ color: '#20241F', textDecorationColor: '#C9C6BA', textUnderlineOffset: 3 }}>{s.name}</a>
                      ) : s.name}
                      <div style={{ fontSize: 11.5, color: '#8A8D84', fontWeight: 400 }}>{s.class_name}</div>
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, whiteSpace: 'nowrap' }}>
                        <span style={{ width: 22, height: 9, borderRadius: 2, background: m.bg, border: `1px solid ${m.border}` }} />
                        {s.belt || 'White'}
                      </span>
                    </td>
                    <td><TapeTracker student={s} earned={tp} onChange={(set) => setOne(s.id, set)} /></td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap', color: enough ? '#2A5A30' : '#20241F' }}><b>{n}</b> / {MIN_CLASSES}</td>
                    <td style={{ fontSize: 12.5, color: '#5B5F56', whiteSpace: 'nowrap' }}>{nextBelt(s.belt)}</td>
                    <td>{ready && <span style={{ fontSize: 11.5, color: '#2A5A30', background: '#E8F1E9', borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap' }}>Ready</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function Metric({ label, value, tone, onClick }) {
  return (
    <div style={{ ...styles.metricCard, cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
      <p style={styles.metricLabel}>{label}</p>
      <p style={{ ...styles.metricValue, color: tone === 'good' ? '#2A5A30' : '#20241F' }}>{value}</p>
    </div>
  );
}
