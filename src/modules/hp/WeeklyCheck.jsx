import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Settings, Trash2 } from 'lucide-react';
import Modal from '../../components/Modal';
import { styles } from '../../lib/uiStyles';
import {
  CODE_LABELS, addSession, applyRowChange, deleteSession, loadPlan, loadTrackingBase, loadWeekTracking,
  saveClassMap, setCheck, shortDate,
} from './ytpData';
import {
  DOC_MIN, addDays, advanceStage, extendStage, physicalStatus, riskyPhases, weekActuals,
} from './ytpTracking';
import { CODE_STYLE, HP_ORANGE, PHASE_STYLE } from './ytpTheme';

const PHYSICAL = Object.keys(DOC_MIN);
const CHECKS = [
  ['ready', 'Ready', '#2A5A30', '#E8F1E9'],
  ['on_track', 'On track', '#45483F', '#EFEDE6'],
  ['needs_time', 'Needs more time', '#9A2B2B', '#FBEAEA'],
];
const STATUS_STYLE = {
  ok: { color: '#2A5A30', bg: '#E8F1E9', text: 'Met' },
  low: { color: '#7A5A00', bg: '#FFF1C9', text: 'Below minimum' },
  none: { color: '#9A2B2B', bg: '#FBEAEA', text: 'Not trained' },
};
// Borg 6–20 scale (NCCP DAA section 4.7)
const BORG = [
  [6, 'No exertion'], [7, 'Extremely light'], [8, ''], [9, 'Very light'], [10, ''], [11, 'Light'], [12, ''],
  [13, 'Somewhat hard'], [14, ''], [15, 'Hard'], [16, ''], [17, 'Very hard'], [18, ''], [19, 'Extremely hard'],
  [20, 'Maximal exertion'],
];
const small = { fontSize: 12, color: '#8A8D84' };
const label = { display: 'block', fontSize: 12.5, color: '#5B5F56', marginBottom: 4 };

function Code({ code }) {
  if (!code) return <span style={{ display: 'inline-block', width: 26 }} />;
  const s = CODE_STYLE[code];
  return (
    <span style={{ display: 'inline-flex', justifyContent: 'center', width: 26, height: 20, alignItems: 'center',
      borderRadius: 4, background: s.bg, color: s.fg, fontWeight: 700, fontSize: 11 }}>
      {code === 'X' ? '●' : code}
    </span>
  );
}

export default function WeeklyCheck({ overview, nowWeek }) {
  const { season } = overview;
  const athletes = overview.athletes.filter((a) => a.plan);
  const [weekNo, setWeekNo] = useState(nowWeek || 1);
  const [base, setBase] = useState(null);
  const [plans, setPlans] = useState(null);
  const [tracking, setTracking] = useState(null);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);

  const fail = (e) => setError(e.message || String(e));
  const reloadPlans = () => Promise.all(athletes.map((a) => loadPlan(a.plan.id)))
    .then((ps) => setPlans(Object.fromEntries(athletes.map((a, i) => [a.id, ps[i]])))).catch(fail);

  useEffect(() => { loadTrackingBase().then(setBase).catch(fail); reloadPlans(); }, []);

  const week0 = plans && Object.values(plans)[0]?.weeks.find((w) => w.week_no === weekNo);
  const weekStart = week0?.week_start;
  const rowIds = useMemo(() => (plans ? Object.values(plans).flatMap((p) => p.rows.map((r) => r.id)) : []), [plans]);

  const reloadWeek = () => {
    if (!weekStart) return;
    setTracking(null);
    loadWeekTracking({ athletes, weekStart, weekEnd: addDays(weekStart, 6), weekNo, rowIds }).then(setTracking).catch(fail);
  };
  useEffect(reloadWeek, [weekStart, weekNo, rowIds.length]);

  const classMap = useMemo(() => Object.fromEntries((base?.classMap || []).map((c) => [c.class_name, c.abilities])), [base]);

  if (error) return <div style={{ ...styles.card, padding: 16, color: '#9A2B2B' }}>Couldn't load: {error}</div>;
  if (!plans || !base) return <div style={{ color: '#5B5F56' }}>Loading...</div>;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <button className="dp-btn" aria-label="Previous week" disabled={weekNo <= 1} onClick={() => setWeekNo(weekNo - 1)}><ChevronLeft size={16} /></button>
        <div style={{ fontSize: 16, fontWeight: 600, minWidth: 190, textAlign: 'center' }}>
          Week {weekNo} · {weekStart && `${shortDate(weekStart)} – ${shortDate(addDays(weekStart, 6))}`}
        </div>
        <button className="dp-btn" aria-label="Next week" disabled={weekNo >= season.weeks} onClick={() => setWeekNo(weekNo + 1)}><ChevronRight size={16} /></button>
        {nowWeek && weekNo !== nowWeek && <button className="dp-btn" onClick={() => setWeekNo(nowWeek)}>This week</button>}
        {weekNo === nowWeek && <span style={{ fontSize: 12.5, fontWeight: 600, color: HP_ORANGE }}>This week</span>}
        {nowWeek && weekNo > nowWeek && <span style={small}>Upcoming week — nothing to count yet</span>}
        <button className="dp-btn" style={{ marginLeft: 'auto' }} onClick={() => setModal({ type: 'classes' })}>
          <Settings size={15} /> Class settings
        </button>
      </div>

      {!tracking && <div style={{ color: '#5B5F56' }}>Loading week...</div>}
      {tracking && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {athletes.map((a) => (
            <AthleteWeek
              key={a.id} athlete={a} plan={plans[a.id]} weekNo={weekNo} weekStart={weekStart}
              tracking={tracking} schedule={base.schedule} classMap={classMap}
              onModal={setModal} onChanged={reloadWeek}
            />
          ))}
          <p style={{ ...small, margin: 0 }}>
            Weekly minimums from NCCP <em>Developing Athletic Abilities</em>: Aerobic stamina 5.10 · Flexibility 5.8.1 ·
            Speed 5.11 · Strength endurance 5.13. Technical and tactical skills have no minimum in the document (1.1), so they use the coach's check.
          </p>
        </div>
      )}

      {modal?.type === 'change' && (
        <ChangePreview {...modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); reloadPlans(); }} />
      )}
      {modal?.type === 'session' && (
        <SessionForm {...modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); reloadWeek(); }} />
      )}
      {modal?.type === 'classes' && (
        <ClassSettings schedule={base.schedule} classMap={classMap} onClose={() => setModal(null)}
          onSaved={() => { setModal(null); loadTrackingBase().then(setBase).catch(fail); }} />
      )}
    </>
  );
}

function AthleteWeek({ athlete, plan, weekNo, weekStart, tracking, schedule, classMap, onModal, onChanged }) {
  const week = plan.weeks.find((w) => w.week_no === weekNo);
  const physicalRows = plan.rows.filter((r) => r.area === 'physical');
  const skillRows = plan.rows.filter((r) => (r.area === 'technical' || r.area === 'tactical') && r.cells[weekNo]);
  const mentalRows = plan.rows.filter((r) => r.area === 'mental' && r.cells[weekNo]);
  const attendance = tracking.attendance.filter((r) => r.student_id === athlete.student_id);
  const sessions = tracking.sessions.filter((s) => s.athlete_id === athlete.id);
  const actual = weekActuals({
    attendance, sessions, schedule, classMap,
    physicalAbilities: [...new Set([...PHYSICAL, ...physicalRows.map((r) => r.name)])],
  });
  const phase = PHASE_STYLE[week?.phase];
  const planned = week?.hours_planned == null ? null : Number(week.hours_planned);

  const change = (row, kind) => {
    const result = kind === 'extend' ? extendStage(row.cells, weekNo) : advanceStage(row.cells, weekNo);
    if (result) onModal({ type: 'change', athlete, plan, row, weekNo, kind, result });
  };

  return (
    <div style={{ ...styles.card, borderTop: `3px solid ${HP_ORANGE}`, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>{athlete.display_name}</span>
        {phase && <span style={{ background: phase.bg, color: phase.fg, borderRadius: 999, padding: '2px 9px', fontSize: 12, fontWeight: 600 }}>{week.phase}</span>}
        <span style={{ marginLeft: 'auto', fontSize: 13.5 }}>
          Hours <b>{actual.hours}</b>{planned != null && <span style={{ color: '#8A8D84' }}> / {planned} planned</span>}
        </span>
      </div>
      {planned != null && planned > 0 && (
        <div style={{ height: 6, background: '#EFEDE6', borderRadius: 3, overflow: 'hidden', marginTop: -6 }}>
          <div style={{ width: `${Math.min(100, (actual.hours / planned) * 100)}%`, height: '100%', background: HP_ORANGE }} />
        </div>
      )}
      <div style={{ fontSize: 13, color: '#45483F' }}>
        {!athlete.student_id
          ? <span style={{ color: '#9A2B2B' }}>Not linked to a student record — attendance isn't counted.</span>
          : Object.keys(actual.byClass).length
            ? Object.entries(actual.byClass).map(([c, n]) => `${c} ×${n}`).join(' · ')
            : <span style={{ color: '#8A8D84' }}>No attendance recorded this week.</span>}
      </div>

      {/* Physical */}
      <Section title="Physical">
        {physicalRows.map((r) => {
          const code = r.cells[weekNo];
          const count = actual.abilityCounts[r.name] || 0;
          const min = DOC_MIN[r.name]?.[code];
          const st = code ? physicalStatus(r.name, code, count) : null;
          const ss = st && STATUS_STYLE[st];
          return (
            <div key={r.id} style={rowStyle}>
              <span style={{ flex: '1 1 150px' }}>{r.name}</span>
              <Code code={code} />
              <span style={{ width: 110, fontSize: 13 }}>
                {code ? <>{count} session{count === 1 ? '' : 's'}{min ? <span style={small}> / min {min}</span> : null}</> : <span style={small}>Not planned</span>}
              </span>
              {ss && <span style={{ fontSize: 12, fontWeight: 600, color: ss.color, background: ss.bg, borderRadius: 999, padding: '2px 8px' }}>{ss.text}</span>}
              {st && st !== 'ok' && code === 'D' && (
                <button className="dp-btn" style={actionBtn} onClick={() => change(r, 'extend')}>Extend 1 week</button>
              )}
            </div>
          );
        })}
      </Section>

      {/* Technical + tactical */}
      <Section title="Technical & tactical">
        {!skillRows.length && <span style={small}>No skills planned this week.</span>}
        {skillRows.map((r) => {
          const check = tracking.checks.find((c) => c.row_id === r.id);
          return (
            <SkillCheck
              key={r.id} row={r} weekNo={weekNo} check={check} onChanged={onChanged}
              onExtend={() => change(r, 'extend')}
              onAdvance={advanceStage(r.cells, weekNo) ? () => change(r, 'advance') : null}
            />
          );
        })}
      </Section>

      {mentalRows.length > 0 && (
        <Section title="Mental">
          <span style={{ fontSize: 13 }}>{mentalRows.map((r) => r.name).join(', ')}</span>
        </Section>
      )}

      <Section title="Individual training">
        {sessions.map((s) => (
          <div key={s.id} style={rowStyle}>
            <span style={{ flex: '1 1 150px', fontSize: 13 }}>
              {shortDate(s.date)} · {s.kind}{s.minutes ? ` · ${s.minutes} min` : ''}{s.rpe ? ` · Borg ${s.rpe}` : ''}
              {s.abilities?.length ? <span style={small}> · {s.abilities.join(', ')}</span> : null}
              {s.notes ? <span style={small}> — {s.notes}</span> : null}
            </span>
            <button className="dp-btn" style={{ padding: 6, border: 'none' }} aria-label="Delete session"
              onClick={() => deleteSession(s.id).then(onChanged)}><Trash2 size={15} /></button>
          </div>
        ))}
        <button className="dp-btn" style={{ alignSelf: 'flex-start' }}
          onClick={() => onModal({ type: 'session', athlete, weekStart, abilities: physicalRows.map((r) => r.name) })}>
          + Add individual session
        </button>
      </Section>
    </div>
  );
}

const rowStyle = { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 14, padding: '5px 0', borderBottom: '1px solid #F1EEE6' };
const actionBtn = { padding: '4px 10px', fontSize: 12.5, borderColor: HP_ORANGE, color: '#8A3A0E' };

function Section({ title, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#8A8D84', marginBottom: 2 }}>{title}</div>
      {children}
    </div>
  );
}

function SkillCheck({ row, weekNo, check, onChanged, onExtend, onAdvance }) {
  const [note, setNote] = useState(check?.note || '');
  const [busy, setBusy] = useState(false);
  useEffect(() => setNote(check?.note || ''), [check?.note, weekNo]);
  const status = check?.status || null;
  const save = (s, n = note) => {
    setBusy(true);
    setCheck(row.id, weekNo, s, n).then(onChanged).finally(() => setBusy(false));
  };
  return (
    <div style={{ ...rowStyle, alignItems: 'flex-start' }}>
      <span style={{ flex: '1 1 150px', paddingTop: 4 }}>
        {row.name} <span style={small}>({CODE_LABELS[row.cells[weekNo]]})</span>
      </span>
      <Code code={row.cells[weekNo]} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '2 1 280px' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {CHECKS.map(([v, l, fg, bg]) => (
            <button key={v} type="button" className="dp-btn" disabled={busy}
              onClick={() => save(status === v ? null : v)}
              style={{ padding: '5px 10px', fontSize: 12.5, ...(status === v ? { background: bg, color: fg, borderColor: fg, fontWeight: 600 } : {}) }}>
              {l}
            </button>
          ))}
        </div>
        {status && (
          <input className="dp-input" style={{ fontSize: 13, padding: '6px 8px' }} placeholder="Note (optional)" value={note}
            onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (check?.note || '') && save(status, note)} />
        )}
        {status === 'needs_time' && <button className="dp-btn" style={{ ...actionBtn, alignSelf: 'flex-start' }} onClick={onExtend}>Extend this stage 1 week</button>}
        {status === 'ready' && onAdvance && (
          <button className="dp-btn" style={{ ...actionBtn, alignSelf: 'flex-start' }} onClick={onAdvance}>Start next stage next week</button>
        )}
      </div>
    </div>
  );
}

function Strip({ cells, from, to, highlight }) {
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {Array.from({ length: to - from + 1 }, (_, i) => from + i).map((w) => (
        <div key={w} style={{ textAlign: 'center', outline: highlight.includes(w) ? `2px solid ${HP_ORANGE}` : 'none', borderRadius: 4 }}>
          <Code code={cells[w]} />
        </div>
      ))}
    </div>
  );
}

function ChangePreview({ athlete, plan, row, weekNo, kind, result, onClose, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const from = Math.max(1, weekNo - 1);
  const to = Math.min(plan.weeks.length, Math.max(result.newEnd + 1, weekNo + 6));
  const risky = riskyPhases(plan.weeks, result.changed);
  const apply = () => {
    setBusy(true);
    applyRowChange(row.id, result.cells, result.changed).then(onSaved).catch((e) => { setError(e.message || String(e)); setBusy(false); });
  };
  return (
    <Modal
      title={kind === 'extend' ? 'Extend 1 week' : 'Start next stage next week'}
      onClose={onClose} maxWidth={620}
      footer={<>
        <button className="dp-btn" onClick={onClose}>Cancel</button>
        <button className="dp-btn dp-btn-primary" disabled={busy} onClick={apply}>Apply</button>
      </>}
    >
      <p style={{ margin: '0 0 12px', fontSize: 14 }}>
        <b>{athlete.display_name}</b> · {row.name} · from week {weekNo}
      </p>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'flex', gap: 3, marginBottom: 4, ...small }}>
          {Array.from({ length: to - from + 1 }, (_, i) => from + i).map((w) => (
            <div key={w} style={{ width: 26, textAlign: 'center', fontWeight: w === weekNo ? 700 : 400 }}>{w}</div>
          ))}
        </div>
        <div style={{ ...small, margin: '6px 0 2px' }}>Now</div>
        <Strip cells={row.cells} from={from} to={to} highlight={[]} />
        <div style={{ ...small, margin: '10px 0 2px' }}>After</div>
        <Strip cells={result.cells} from={from} to={to} highlight={result.changed} />
      </div>
      <p style={{ ...small, marginTop: 12 }}>
        {kind === 'extend'
          ? 'The rest of this block moves one week later. Phases and events don\'t move.'
          : 'The rest of this block moves earlier; the freed weeks at the end keep the last stage.'}
      </p>
      {(result.overflow || risky.length > 0) && (
        <div style={{ background: '#FFF6DB', color: '#7A5A00', fontSize: 13, borderRadius: 6, padding: '8px 10px', marginTop: 8 }}>
          {result.overflow && <div>The block now runs into the next planned weeks (or past the season end) — check the row after applying.</div>}
          {risky.length > 0 && <div>Changed weeks fall in {risky.join(', ')}.</div>}
        </div>
      )}
      {error && <div style={{ color: '#9A2B2B', fontSize: 13, marginTop: 8 }}>{error}</div>}
    </Modal>
  );
}

function SessionForm({ athlete, weekStart, abilities, onClose, onSaved }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const [f, setF] = useState({ date: days[6], kind: 'Individual', minutes: '', rpe: '', abilities: [], notes: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const all = [...new Set([...abilities, ...PHYSICAL])];
  const toggle = (a) => setF({ ...f, abilities: f.abilities.includes(a) ? f.abilities.filter((x) => x !== a) : [...f.abilities, a] });
  const save = () => {
    setBusy(true);
    addSession({
      athlete_id: athlete.id, date: f.date, kind: f.kind.trim() || 'Individual',
      minutes: f.minutes === '' ? null : Number(f.minutes), rpe: f.rpe === '' ? null : Number(f.rpe),
      abilities: f.abilities, notes: f.notes.trim() || null,
    }).then(onSaved).catch((e) => { setError(e.message || String(e)); setBusy(false); });
  };
  const badMinutes = f.minutes !== '' && (Number.isNaN(Number(f.minutes)) || Number(f.minutes) < 0);
  return (
    <Modal
      title={`Individual session · ${athlete.display_name}`} onClose={onClose}
      footer={<>
        <button className="dp-btn" onClick={onClose}>Cancel</button>
        <button className="dp-btn dp-btn-primary" disabled={busy || badMinutes} onClick={save}>Add</button>
      </>}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label>
          <span style={label}>Day</span>
          <select className="dp-select" style={{ width: '100%' }} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })}>
            {days.map((d) => <option key={d} value={d}>{shortDate(d)}</option>)}
          </select>
        </label>
        <label>
          <span style={label}>Minutes</span>
          <input className="dp-input" style={{ width: '100%' }} inputMode="numeric" value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value.trim() })} />
        </label>
        <label>
          <span style={label}>Type</span>
          <input className="dp-input" style={{ width: '100%' }} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} />
        </label>
        <label>
          <span style={label}>How hard (Borg 6–20)</span>
          <select className="dp-select" style={{ width: '100%' }} value={f.rpe} onChange={(e) => setF({ ...f, rpe: e.target.value })}>
            <option value="">—</option>
            {BORG.map(([n, l]) => <option key={n} value={n}>{n}{l ? ` · ${l}` : ''}</option>)}
          </select>
        </label>
      </div>
      <span style={{ ...label, marginTop: 12 }}>Trained</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
        {all.map((a) => (
          <label key={a} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
            <input type="checkbox" checked={f.abilities.includes(a)} onChange={() => toggle(a)} /> {a}
          </label>
        ))}
      </div>
      <label style={{ display: 'block', marginTop: 12 }}>
        <span style={label}>Notes</span>
        <input className="dp-input" style={{ width: '100%' }} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      </label>
      {badMinutes && <div style={{ color: '#9A2B2B', fontSize: 13, marginTop: 8 }}>Minutes must be a number.</div>}
      {error && <div style={{ color: '#9A2B2B', fontSize: 13, marginTop: 8 }}>{error}</div>}
    </Modal>
  );
}

function ClassSettings({ schedule, classMap, onClose, onSaved }) {
  const classes = [...new Set([...schedule.map((s) => s.class_name), ...Object.keys(classMap)])].sort();
  const [map, setMap] = useState(() => Object.fromEntries(classes.map((c) => [c, classMap[c] || []])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toggle = (c, a) => {
    const cur = map[c];
    let next;
    if (a === '*') next = cur.includes('*') ? [] : ['*'];
    else next = cur.includes(a) ? cur.filter((x) => x !== a) : [...cur.filter((x) => x !== '*'), a];
    setMap({ ...map, [c]: next });
  };
  const save = async () => {
    setBusy(true);
    try {
      for (const c of classes) {
        const before = (classMap[c] || []).slice().sort().join();
        if (map[c].slice().sort().join() !== before) await saveClassMap(c, map[c]);
      }
      onSaved();
    } catch (e) {
      setError(e.message || String(e));
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Class settings" onClose={onClose} maxWidth={640}
      footer={<>
        <button className="dp-btn" onClick={onClose}>Cancel</button>
        <button className="dp-btn dp-btn-primary" disabled={busy} onClick={save}>Save</button>
      </>}
    >
      <p style={{ ...small, marginTop: 0 }}>
        Which physical abilities one attendance of each class counts toward. "Season plan" counts toward every ability planned that week.
      </p>
      {classes.map((c) => (
        <div key={c} style={{ ...rowStyle, alignItems: 'flex-start' }}>
          <span style={{ flex: '0 0 160px', fontWeight: 500 }}>{c}</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', flex: 1 }}>
            {['*', ...PHYSICAL].map((a) => (
              <label key={a} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13 }}>
                <input type="checkbox" checked={map[c].includes(a)} onChange={() => toggle(c, a)} />
                {a === '*' ? 'Season plan' : a}
              </label>
            ))}
          </div>
        </div>
      ))}
      {error && <div style={{ color: '#9A2B2B', fontSize: 13, marginTop: 8 }}>{error}</div>}
    </Modal>
  );
}
