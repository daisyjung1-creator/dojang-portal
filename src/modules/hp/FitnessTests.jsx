// "Fitness Tests" tab: enter test results for every active Comp Team student, one test date at a time.
import React, { useEffect, useMemo, useState } from 'react';
import { styles } from '../../lib/uiStyles';
import {
  columnsFor, fmtValue, loadDateResults, loadTestBase, parseValue, saveNote, saveResult, sideKey,
} from './fitTests';
import { HP_ORANGE } from './ytpTheme';
import ManageTests from './ManageTests';

const NAME_W = 170;
const COL_W = 74;

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function prettyDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function FitnessTests() {
  const [base, setBase] = useState(null);
  const [testDate, setTestDate] = useState('');
  const [newDate, setNewDate] = useState(todayIso());
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [hpOnly, setHpOnly] = useState(false);
  const [managing, setManaging] = useState(false);

  const fail = (e) => setError(e.message || String(e));
  const loadBase = (keepDate) => loadTestBase()
    .then((b) => { setBase(b); if (!keepDate) setTestDate(b.dates[0] || ''); }).catch(fail);
  useEffect(() => { loadBase(false); }, []);
  useEffect(() => {
    if (!testDate) return;
    setData(null);
    loadDateResults(testDate).then(setData).catch(fail);
  }, [testDate]);

  const cols = useMemo(() => (base ? columnsFor(base.items) : []), [base]);
  const groups = useMemo(() => {
    const out = [];
    cols.forEach((c) => {
      const last = out[out.length - 1];
      if (last && last.category === c.item.category) last.span += 1;
      else out.push({ category: c.item.category, span: 1 });
    });
    return out;
  }, [cols]);

  if (error) return <div style={{ ...styles.card, padding: 16, color: '#9A2B2B' }}>Couldn't load tests: {error}</div>;
  if (!base) return <div style={{ color: '#5B5F56' }}>Loading...</div>;
  if (managing) return <ManageTests onBack={() => { setManaging(false); setData(null); loadBase(true); if (testDate) loadDateResults(testDate).then(setData).catch(fail); }} />;

  const dates = testDate && !base.dates.includes(testDate) ? [testDate, ...base.dates] : base.dates;
  const students = base.students.filter((s) => !hpOnly || /(^|,\s*)HP(\s*,|$)/.test(s.class_name || ''));

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <label>
          <span style={{ display: 'block', fontSize: 12.5, color: '#5B5F56', marginBottom: 4 }}>Test date</span>
          <select className="dp-select" value={testDate} onChange={(e) => setTestDate(e.target.value)} style={{ minWidth: 170 }}>
            {!dates.length && <option value="">No tests yet</option>}
            {dates.map((d) => <option key={d} value={d}>{prettyDate(d)}</option>)}
          </select>
        </label>
        <label>
          <span style={{ display: 'block', fontSize: 12.5, color: '#5B5F56', marginBottom: 4 }}>New test day</span>
          <span style={{ display: 'flex', gap: 6 }}>
            <input type="date" className="dp-input" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
            <button className="dp-btn" disabled={!newDate} onClick={() => setTestDate(newDate)}>Open</button>
          </span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, marginLeft: 'auto' }}>
          <input type="checkbox" checked={hpOnly} onChange={(e) => setHpOnly(e.target.checked)} /> HP athletes only
        </label>
        <button className="dp-btn" onClick={() => setManaging(true)}>Manage tests</button>
      </div>
      <p style={{ fontSize: 12.5, color: '#8A8D84', margin: '0 0 10px' }}>
        {students.length} active Comp Team students. Each box saves when you leave it. Type "full" for a full front split (saved as 0).
      </p>

      {!testDate && <div style={{ ...styles.card, padding: 16, color: '#5B5F56' }}>Pick a test day and press Open to start.</div>}
      {testDate && !data && <div style={{ color: '#5B5F56' }}>Loading...</div>}
      {testDate && data && (
        <div className="ft-scroll">
          <style>{CSS}</style>
          <table className="ft-table" style={{ width: NAME_W + (cols.length + 1) * COL_W + 140 }}>
            <thead>
              <tr className="ft-group">
                <th className="ft-name" />
                {groups.map((g) => <th key={g.category} colSpan={g.span}>{g.category}</th>)}
                <th />
              </tr>
              <tr className="ft-head">
                <th className="ft-name">Student</th>
                {cols.map((c) => (
                  <th key={sideKey(c.item.key, c.side)} title={[c.item.unit, c.item.notes].filter(Boolean).join(' · ')}>
                    {c.label}
                    {c.item.unit && <span className="ft-unit">{c.item.unit}</span>}
                  </th>
                ))}
                <th style={{ width: 140 }}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <StudentRow key={s.id} student={s} cols={cols} testDate={testDate} data={data} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function StudentRow({ student, cols, testDate, data }) {
  const mine = useMemo(() => {
    const m = {};
    data.results.filter((r) => r.student_id === student.id).forEach((r) => { m[sideKey(r.item_key, r.side)] = r.value; });
    return m;
  }, [data, student.id]);
  const note = data.notes.find((n) => n.student_id === student.id)?.note || '';
  return (
    <tr>
      <th className="ft-name" title={student.name}>{student.name}</th>
      {cols.map((c) => (
        <ValueCell key={sideKey(c.item.key, c.side)} studentId={student.id} testDate={testDate} col={c}
          initial={mine[sideKey(c.item.key, c.side)]} />
      ))}
      <NoteCell studentId={student.id} testDate={testDate} initial={note} />
    </tr>
  );
}

function ValueCell({ studentId, testDate, col, initial }) {
  const [text, setText] = useState(fmtValue(initial));
  const [saved, setSaved] = useState(fmtValue(initial));
  const [state, setState] = useState(''); // '', 'saving', 'error'
  useEffect(() => { setText(fmtValue(initial)); setSaved(fmtValue(initial)); }, [initial, testDate]);
  const value = parseValue(text);
  const bad = Number.isNaN(value);
  const commit = () => {
    if (bad || fmtValue(value) === saved) return;
    setState('saving');
    saveResult(studentId, testDate, col.item.key, col.side, value)
      .then(() => { setSaved(fmtValue(value)); setText(fmtValue(value)); setState(''); })
      .catch(() => setState('error'));
  };
  return (
    <td className={bad || state === 'error' ? 'ft-bad' : state === 'saving' ? 'ft-saving' : ''}>
      <input
        inputMode="decimal" value={text} aria-label={col.label}
        onChange={(e) => setText(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      />
    </td>
  );
}

function NoteCell({ studentId, testDate, initial }) {
  const [text, setText] = useState(initial);
  useEffect(() => setText(initial), [initial, testDate]);
  return (
    <td>
      <input value={text} aria-label="Notes" style={{ textAlign: 'left' }} onChange={(e) => setText(e.target.value)}
        onBlur={() => text.trim() !== initial && saveNote(studentId, testDate, text.trim())} />
    </td>
  );
}

const CSS = `
.ft-scroll { overflow: auto; max-height: calc(100vh - 260px); -webkit-overflow-scrolling: touch; background: #fff; border: 1px solid #DEDACC; border-radius: 10px; }
.ft-table { border-collapse: separate; border-spacing: 0; table-layout: fixed; font-size: 12.5px; }
.ft-table th, .ft-table td { border-right: 1px solid #EFECE3; border-bottom: 1px solid #EFECE3; padding: 0; }
.ft-table thead th { position: sticky; background: #FAF8F3; z-index: 2; font-weight: 500; color: #45483F; }
.ft-group th { top: 0; height: 26px; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #8A8D84; text-align: left; padding: 0 8px; border-right: 1px solid #DEDACC; }
.ft-head th { top: 26px; height: 54px; width: ${COL_W}px; font-size: 11.5px; line-height: 1.2; padding: 4px; vertical-align: bottom; text-align: center; }
.ft-unit { display: block; color: #8A8D84; font-size: 10.5px; margin-top: 2px; }
.ft-name { position: sticky; left: 0; z-index: 3 !important; background: #FAF8F3; width: ${NAME_W}px; text-align: left !important; padding: 0 10px !important;
  font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-right: 1px solid #DEDACC !important; }
tbody .ft-name { z-index: 1 !important; height: 34px; }
.ft-table td input { all: unset; box-sizing: border-box; width: 100%; height: 34px; text-align: center; font-variant-numeric: tabular-nums; padding: 0 4px; }
.ft-table td input:focus { outline: 2px solid ${HP_ORANGE}; outline-offset: -2px; background: #FFF8F2; }
.ft-table td.ft-bad { background: #FBEAEA; }
.ft-table td.ft-saving { background: #FFF8F2; }
`;
