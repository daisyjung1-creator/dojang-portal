// Pop-ups for editing a YTP. Each one saves straight to the database and then calls onSaved().
import React, { useState } from 'react';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import {
  CODE_LABELS, addEvent, addRow, deleteEvent, deleteRow, renameRow, setCells, shortDate,
  updateEvent, updateWeeks, weekRange,
} from './ytpData';
import { CODE_STYLE, HP_ORANGE, PHASE_STYLE } from './ytpTheme';

const PHASES = Object.keys(PHASE_STYLE);
const KINDS = [
  ['competition', 'Competition'], ['camp', 'Camp'], ['testing', 'Testing'], ['break', 'Break'], ['other', 'Other'],
];
const CODES_FOR = { physical: ['D', 'M'], technical: ['I', 'D', 'C', 'R'], tactical: ['I', 'D', 'C', 'R'], mental: ['X'] };
const NUMBER_FIELDS = [
  ['volume_pct', 'Volume %'], ['intensity_pct', 'Intensity %'], ['physical_pct', 'Physical %'],
  ['technique_pct', 'Technique %'], ['tactical_pct', 'Tactical %'], ['mental_pct', 'Mental %'],
  ['hours_planned', 'Planned hours'],
];

const label = { display: 'block', fontSize: 12.5, color: '#5B5F56', marginBottom: 4 };
const errBox = { color: '#9A2B2B', fontSize: 13, marginTop: 10 };

function useSaver(onSaved) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      onSaved();
    } catch (e) {
      setError(e.message || String(e));
      setBusy(false);
    }
  };
  return { busy, error, run };
}

function WeekSelect({ weeks, value, onChange }) {
  return (
    <select className="dp-select" style={{ width: '100%' }} value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {weeks.map((w) => (
        <option key={w.week_no} value={w.week_no}>Week {w.week_no} · {shortDate(w.week_start)}</option>
      ))}
    </select>
  );
}

function RangePicker({ weeks, from, to, setFrom, setTo }) {
  const n = Math.abs(to - from) + 1;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}><span style={label}>From</span><WeekSelect weeks={weeks} value={from} onChange={setFrom} /></div>
        <div style={{ flex: 1 }}><span style={label}>To</span><WeekSelect weeks={weeks} value={to} onChange={setTo} /></div>
      </div>
      <div style={{ fontSize: 12, color: '#8A8D84', marginTop: 4 }}>{n} week{n > 1 ? 's' : ''}</div>
    </div>
  );
}

function CodeButton({ code, onClick, disabled }) {
  const s = CODE_STYLE[code];
  return (
    <button
      type="button" className="dp-btn" disabled={disabled} onClick={onClick}
      style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4, minWidth: 96, padding: '10px 12px' }}
    >
      <span style={{ background: s.bg, color: s.fg, borderRadius: 4, padding: '1px 8px', fontWeight: 700 }}>
        {code === 'X' ? '●' : code}
      </span>
      <span style={{ fontSize: 12.5 }}>{CODE_LABELS[code]}</span>
    </button>
  );
}

/** Tap a skill cell: set a code on one week or a range of weeks. */
export function CellEditor({ row, weekNo, weeks, onClose, onSaved }) {
  const [from, setFrom] = useState(weekNo);
  const [to, setTo] = useState(weekNo);
  const { busy, error, run } = useSaver(onSaved);
  const apply = (code) => run(() => setCells(row.id, weekRange(from, to), code));
  return (
    <Modal title={row.name} onClose={onClose} footer={<button className="dp-btn" onClick={onClose}>Close</button>}>
      <RangePicker weeks={weeks} from={from} to={to} setFrom={setFrom} setTo={setTo} />
      <span style={label}>Set to</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {CODES_FOR[row.area].map((c) => <CodeButton key={c} code={c} disabled={busy} onClick={() => apply(c)} />)}
        <button type="button" className="dp-btn" disabled={busy} onClick={() => apply(null)} style={{ minWidth: 96 }}>
          Clear
        </button>
      </div>
      {error && <div style={errBox}>{error}</div>}
    </Modal>
  );
}

/** Tap the phase row: change the phase for one week or a range. */
export function PhaseEditor({ planId, weekNo, weeks, onClose, onSaved }) {
  const [from, setFrom] = useState(weekNo);
  const [to, setTo] = useState(weekNo);
  const { busy, error, run } = useSaver(onSaved);
  const apply = (phase) => run(() => updateWeeks(planId, weekRange(from, to), { phase }));
  return (
    <Modal title="Phase" onClose={onClose} footer={<button className="dp-btn" onClick={onClose}>Close</button>}>
      <RangePicker weeks={weeks} from={from} to={to} setFrom={setFrom} setTo={setTo} />
      <span style={label}>Set to</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {PHASES.map((p) => (
          <button
            key={p} type="button" className="dp-btn" disabled={busy} onClick={() => apply(p)}
            style={{ background: PHASE_STYLE[p].bg, color: PHASE_STYLE[p].fg, borderColor: 'transparent', fontWeight: 600 }}
          >
            {p}
          </button>
        ))}
      </div>
      {error && <div style={errBox}>{error}</div>}
    </Modal>
  );
}

/** Tap a loading number: edit all numbers of a week (optionally copy them to more weeks). */
export function NumbersEditor({ planId, week, weeks, onClose, onSaved }) {
  const [vals, setVals] = useState(() =>
    Object.fromEntries(NUMBER_FIELDS.map(([k]) => [k, week[k] == null ? '' : String(Number(week[k]))])));
  const [to, setTo] = useState(week.week_no);
  const { busy, error, run } = useSaver(onSaved);
  const factorSum = ['physical_pct', 'technique_pct', 'tactical_pct', 'mental_pct']
    .reduce((s, k) => s + (vals[k] === '' ? 0 : Number(vals[k])), 0);
  const anyFactor = ['physical_pct', 'technique_pct', 'tactical_pct', 'mental_pct'].some((k) => vals[k] !== '');
  const bad = NUMBER_FIELDS.some(([k]) => vals[k] !== '' && (Number.isNaN(Number(vals[k])) || Number(vals[k]) < 0
    || (k !== 'hours_planned' && Number(vals[k]) > 100)));

  const save = () => run(() => updateWeeks(planId, weekRange(week.week_no, to),
    Object.fromEntries(NUMBER_FIELDS.map(([k]) => [k, vals[k] === '' ? null : Number(vals[k])]))));

  return (
    <Modal
      title={`Week ${week.week_no} · ${shortDate(week.week_start)}`}
      onClose={onClose}
      footer={<>
        <button className="dp-btn" onClick={onClose}>Cancel</button>
        <button className="dp-btn dp-btn-primary" disabled={busy || bad} onClick={save}>Save</button>
      </>}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {NUMBER_FIELDS.map(([k, l]) => (
          <label key={k}>
            <span style={label}>{l}</span>
            <input
              className="dp-input" style={{ width: '100%' }} inputMode="decimal" value={vals[k]}
              onChange={(e) => setVals({ ...vals, [k]: e.target.value.trim() })}
            />
          </label>
        ))}
      </div>
      {anyFactor && factorSum !== 100 && (
        <div style={{ background: '#FFF6DB', color: '#7A5A00', fontSize: 13, borderRadius: 6, padding: '8px 10px', marginTop: 12 }}>
          Physical + Technique + Tactical + Mental add up to {factorSum}%, not 100%.
        </div>
      )}
      {bad && <div style={errBox}>Use numbers only (percentages from 0 to 100).</div>}
      <div style={{ marginTop: 14 }}>
        <span style={label}>Save the same numbers through</span>
        <WeekSelect weeks={weeks.filter((w) => w.week_no >= week.week_no)} value={to} onChange={setTo} />
      </div>
      {error && <div style={errBox}>{error}</div>}
    </Modal>
  );
}

function EventForm({ planId, weeks, event, defaultWeek, onDone, onCancel }) {
  const [f, setF] = useState(() => event
    ? { name: event.name, week_no: event.week_no, kind: event.kind, priority: event.priority || '', tentative: event.tentative }
    : { name: '', week_no: defaultWeek, kind: 'competition', priority: '', tentative: false });
  const [applyAll, setApplyAll] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { busy, error, run } = useSaver(onDone);
  const fields = { ...f, name: f.name.trim(), priority: f.priority || null };

  const save = () => run(() => (event ? updateEvent(event, fields, applyAll) : addEvent(planId, fields, applyAll)));

  return (
    <div style={{ border: '1px solid #DEDACC', borderRadius: 8, padding: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label style={{ gridColumn: '1 / -1' }}>
          <span style={label}>Name</span>
          <input className="dp-input" style={{ width: '100%' }} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </label>
        <label style={{ gridColumn: '1 / -1' }}>
          <span style={label}>Week</span>
          <WeekSelect weeks={weeks} value={f.week_no} onChange={(w) => setF({ ...f, week_no: w })} />
        </label>
        <label>
          <span style={label}>Type</span>
          <select className="dp-select" style={{ width: '100%' }} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
            {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label>
          <span style={label}>Priority</span>
          <select className="dp-select" style={{ width: '100%' }} value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>
            <option value="">None</option>
            <option value="L">L — Low</option>
            <option value="M">M — Medium</option>
            <option value="H">H — High</option>
          </select>
        </label>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 14 }}>
        <input type="checkbox" checked={f.tentative} onChange={(e) => setF({ ...f, tentative: e.target.checked })} />
        Tentative (dates not confirmed)
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 14, fontWeight: 600, color: HP_ORANGE }}>
        <input type="checkbox" checked={applyAll} onChange={(e) => setApplyAll(e.target.checked)} />
        Apply to all HP athletes
      </label>
      {applyAll && event && (
        <div style={{ fontSize: 12, color: '#8A8D84', marginTop: 4 }}>
          Changes every athlete's "{event.name}" in week {event.week_no}.
        </div>
      )}
      {error && <div style={errBox}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {event && (
          <button className="dp-btn dp-btn-danger" disabled={busy} onClick={() => setConfirmDelete(true)} style={{ marginRight: 'auto' }}>
            Delete
          </button>
        )}
        <button className="dp-btn" onClick={onCancel}>Cancel</button>
        <button className="dp-btn dp-btn-primary" disabled={busy || !fields.name} onClick={save}>
          {event ? 'Save' : 'Add event'}
        </button>
      </div>
      {confirmDelete && (
        <ConfirmDialog
          message={`Delete "${event.name}"${applyAll ? ' for all HP athletes' : ''}?`}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => { setConfirmDelete(false); run(() => deleteEvent(event, applyAll)); }}
        />
      )}
    </div>
  );
}

/** Tap the events row: see, edit, add or delete the events of a week. */
export function EventsEditor({ planId, weekNo, weeks, events, onClose, onSaved }) {
  const week = weeks.find((w) => w.week_no === weekNo);
  const here = events.filter((e) => e.week_no === weekNo);
  const [editing, setEditing] = useState(here.length ? null : 'new');
  return (
    <Modal
      title={`Events · Week ${weekNo} · ${shortDate(week.week_start)}`}
      onClose={onClose}
      maxWidth={500}
      footer={<button className="dp-btn" onClick={onClose}>Close</button>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {here.map((e) => (editing === e.id ? (
          <EventForm key={e.id} planId={planId} weeks={weeks} event={e} onDone={onSaved} onCancel={() => setEditing(null)} />
        ) : (
          <button
            key={e.id} type="button" className="dp-btn" onClick={() => setEditing(e.id)}
            style={{ justifyContent: 'space-between', width: '100%' }}
          >
            <span>
              <b style={{ fontWeight: 600 }}>{e.name}</b>
              <span style={{ color: '#8A8D84' }}>
                {' '}· {e.kind}{e.priority ? ` · ${e.priority}` : ''}{e.tentative ? ' · tentative' : ''}
              </span>
            </span>
            <span style={{ color: HP_ORANGE, fontSize: 13 }}>Edit</span>
          </button>
        )))}
        {editing === 'new' ? (
          <EventForm planId={planId} weeks={weeks} defaultWeek={weekNo} onDone={onSaved} onCancel={() => setEditing(null)} />
        ) : (
          <button type="button" className="dp-btn" onClick={() => setEditing('new')} style={{ justifyContent: 'center' }}>
            + Add event
          </button>
        )}
      </div>
    </Modal>
  );
}

/** Tap a row name: rename, move or delete it. */
export function RowEditor({ row, canUp, canDown, onMove, onClose, onSaved }) {
  const [name, setName] = useState(row.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { busy, error, run } = useSaver(onSaved);
  const filled = Object.keys(row.cells).length;
  return (
    <Modal
      title="Edit row"
      onClose={onClose}
      footer={<>
        <button className="dp-btn dp-btn-danger" disabled={busy} onClick={() => setConfirmDelete(true)} style={{ marginRight: 'auto' }}>
          Delete row
        </button>
        <button className="dp-btn" onClick={onClose}>Cancel</button>
        <button className="dp-btn dp-btn-primary" disabled={busy || !name.trim() || name.trim() === row.name}
          onClick={() => run(() => renameRow(row.id, name.trim()))}>Save name</button>
      </>}
    >
      <label>
        <span style={label}>Name</span>
        <input className="dp-input" style={{ width: '100%' }} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="dp-btn" disabled={busy || !canUp} onClick={() => run(() => onMove(-1))}>↑ Move up</button>
        <button className="dp-btn" disabled={busy || !canDown} onClick={() => run(() => onMove(1))}>↓ Move down</button>
      </div>
      {error && <div style={errBox}>{error}</div>}
      {confirmDelete && (
        <ConfirmDialog
          message={`Delete "${row.name}"${filled ? ` and its ${filled} planned week${filled > 1 ? 's' : ''}` : ''}?`}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => { setConfirmDelete(false); run(() => deleteRow(row.id)); }}
        />
      )}
    </Modal>
  );
}

/** "+ Add" on a section: add a new skill / ability row. */
export function AddRowEditor({ planId, area, areaLabel, nextSort, existing, onClose, onSaved }) {
  const [name, setName] = useState('');
  const { busy, error, run } = useSaver(onSaved);
  const clean = name.trim();
  const dup = existing.some((n) => n.toLowerCase() === clean.toLowerCase());
  return (
    <Modal
      title={`Add ${areaLabel.toLowerCase()} row`}
      onClose={onClose}
      footer={<>
        <button className="dp-btn" onClick={onClose}>Cancel</button>
        <button className="dp-btn dp-btn-primary" disabled={busy || !clean || dup}
          onClick={() => run(() => addRow(planId, area, clean, nextSort))}>Add</button>
      </>}
    >
      <label>
        <span style={label}>Name</span>
        <input className="dp-input" style={{ width: '100%' }} autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      {dup && <div style={errBox}>This plan already has a row with that name.</div>}
      {error && <div style={errBox}>{error}</div>}
    </Modal>
  );
}
