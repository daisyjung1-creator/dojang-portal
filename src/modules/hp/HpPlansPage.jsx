import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, CalendarDays, Pencil, Check } from 'lucide-react';
import { styles } from '../../lib/uiStyles';
import YtpGrid, { YtpLegend } from './YtpGrid';
import WeeklyCheck from './WeeklyCheck';
import { AREAS, CODE_LABELS, currentWeekNo, loadOverview, loadPlan, nextEvent, shortDate, swapRows } from './ytpData';
import { AddRowEditor, CellEditor, EventsEditor, NumbersEditor, PhaseEditor, RowEditor } from './YtpEditors';
import { HP_FONT, HP_ORANGE, PHASE_STYLE } from './ytpTheme';

function weeksAway(n) {
  if (n === 0) return 'this week';
  if (n === 1) return 'next week';
  return `in ${n} weeks`;
}

function PhaseChip({ phase }) {
  const s = PHASE_STYLE[phase];
  if (!s) return null;
  return (
    <span style={{ background: s.bg, color: s.fg, borderRadius: 999, padding: '2px 9px', fontSize: 12, fontWeight: 600 }}>
      {phase}
    </span>
  );
}

export default function HpPlansPage() {
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState('athletes');

  useEffect(() => {
    loadOverview().then(setOverview).catch((e) => setError(e.message || String(e)));
  }, []);

  const season = overview?.season;
  const nowWeek = season ? currentWeekNo(season.start_date, season.weeks) : null;
  const selected = overview?.athletes.find((a) => a.id === selectedId) || null;

  return (
    <div style={{ fontFamily: HP_FONT }}>
      {error && <div style={{ ...styles.card, padding: 16, color: '#9A2B2B', marginBottom: 14 }}>Couldn't load HP plans: {error}</div>}
      {!overview && !error && <div style={{ color: '#5B5F56' }}>Loading...</div>}
      {overview && !selected && (
        <>
          <div style={styles.header}>
            <div>
              <h1 style={styles.title}>HP Plans</h1>
              <p style={styles.subtitle}>
                {season ? `Season ${season.name}` : 'No season yet'}
                {nowWeek ? ` · Week ${nowWeek} of ${season.weeks}` : ''}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid #DEDACC' }}>
            {[['athletes', 'Athletes'], ['weekly', 'Weekly Check']].map(([id, l]) => (
              <button key={id} type="button" onClick={() => setTab(id)} style={{
                all: 'unset', cursor: 'pointer', padding: '8px 14px', fontSize: 14, fontWeight: tab === id ? 600 : 400,
                color: tab === id ? '#20241F' : '#5B5F56', borderBottom: `2px solid ${tab === id ? HP_ORANGE : 'transparent'}`, marginBottom: -1,
              }}>{l}</button>
            ))}
          </div>
          {tab === 'athletes' && <AthleteList overview={overview} nowWeek={nowWeek} onOpen={setSelectedId} />}
          {tab === 'weekly' && season && <WeeklyCheck overview={overview} nowWeek={nowWeek} />}
        </>
      )}
      {overview && selected && (
        <AthletePlan athlete={selected} season={season} nowWeek={nowWeek} onBack={() => setSelectedId(null)} />
      )}
    </div>
  );
}

function AthleteList({ overview, nowWeek, onOpen }) {
  const { athletes } = overview;
  return (
    <>
      {!athletes.length && <div style={{ ...styles.card, padding: 16, color: '#5B5F56' }}>No HP athletes yet.</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
        {athletes.map((a) => {
          const week = a.weeks.find((w) => w.week_no === nowWeek);
          const next = nextEvent(a.events, nowWeek);
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => onOpen(a.id)}
              disabled={!a.plan}
              style={{
                ...styles.card, padding: '16px 16px 14px', textAlign: 'left', cursor: a.plan ? 'pointer' : 'default',
                fontFamily: 'inherit', borderTop: `3px solid ${HP_ORANGE}`, display: 'flex', flexDirection: 'column', gap: 10,
              }}
            >
              <div>
                <div style={{ fontSize: 17, fontWeight: 600, color: '#20241F' }}>{a.display_name}</div>
                <div style={{ fontSize: 13, color: '#5B5F56', marginTop: 2 }}>
                  {[a.category, a.level].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#45483F' }}>
                {nowWeek ? <>Week {nowWeek} <PhaseChip phase={week?.phase} /></> : 'Outside the season'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#45483F' }}>
                <CalendarDays size={15} strokeWidth={1.75} color={HP_ORANGE} />
                {next ? (
                  <span>
                    <b style={{ fontWeight: 600 }}>{next.name}</b>
                    {next.tentative ? ' (tentative)' : ''} · {weeksAway(next.week_no - nowWeek)}
                  </span>
                ) : 'No upcoming events'}
              </div>
              {!a.plan && <div style={{ fontSize: 12, color: '#8A8D84' }}>No plan for this season</div>}
            </button>
          );
        })}
      </div>
    </>
  );
}

function AthletePlan({ athlete, season, nowWeek, onBack }) {
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState('');
  const [selectedWeek, setSelectedWeek] = useState(nowWeek || 1);
  const [editMode, setEditMode] = useState(false);
  const [editing, setEditing] = useState(null); // { type, payload }

  const reload = () => loadPlan(athlete.plan.id).then(setPlan).catch((e) => setError(e.message || String(e)));
  useEffect(() => {
    setPlan(null);
    reload();
  }, [athlete.plan.id]);

  const close = () => setEditing(null);
  const saved = () => { setEditing(null); reload(); };

  return (
    <>
      <button type="button" className="dp-btn" onClick={onBack} style={{ marginBottom: 12 }}>
        <ChevronLeft size={16} /> All athletes
      </button>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>{athlete.display_name}</h1>
          <p style={styles.subtitle}>
            {[athlete.category, athlete.level, season && `Season ${season.name}`].filter(Boolean).join(' · ')}
          </p>
        </div>
        {plan && (
          <button
            type="button"
            className={`dp-btn${editMode ? ' dp-btn-primary' : ''}`}
            onClick={() => setEditMode(!editMode)}
            style={editMode ? { background: HP_ORANGE, borderColor: HP_ORANGE, color: '#fff' } : undefined}
          >
            {editMode ? <><Check size={16} /> Done</> : <><Pencil size={15} /> Edit</>}
          </button>
        )}
      </div>
      {editMode && (
        <div style={{ background: '#FDF0E6', border: `1px solid ${HP_ORANGE}`, borderRadius: 8, padding: '9px 12px', fontSize: 13, color: '#6B3410', marginBottom: 12 }}>
          Edit mode — tap any cell, phase, event, number or row name to change it. Changes save right away.
        </div>
      )}
      {error && <div style={{ ...styles.card, padding: 16, color: '#9A2B2B' }}>Couldn't load the plan: {error}</div>}
      {!plan && !error && <div style={{ color: '#5B5F56' }}>Loading...</div>}
      {plan && (
        <>
          <WeekSummary plan={plan} weekNo={selectedWeek} nowWeek={nowWeek} />
          <YtpGrid
            plan={plan} nowWeek={nowWeek} selectedWeek={selectedWeek} onSelectWeek={setSelectedWeek}
            editMode={editMode} onEdit={(type, payload) => setEditing({ type, payload })}
          />
          {editing && <PlanEditor plan={plan} planId={athlete.plan.id} editing={editing} onClose={close} onSaved={saved} />}
          <p style={{ fontSize: 12, color: '#8A8D84', margin: '8px 2px 0' }}>
            Swipe sideways to see the whole season. Tap a week number to see that week above.
          </p>
          <YtpLegend />
        </>
      )}
    </>
  );
}

function WeekSummary({ plan, weekNo, nowWeek }) {
  const week = plan.weeks.find((w) => w.week_no === weekNo);
  const events = plan.events.filter((e) => e.week_no === weekNo);
  const focus = useMemo(
    () => AREAS.map((a) => ({
      ...a,
      items: plan.rows
        .filter((r) => r.area === a.id && r.cells[weekNo])
        .map((r) => (a.id === 'mental' ? r.name : `${r.name} (${CODE_LABELS[r.cells[weekNo]]})`)),
    })).filter((a) => a.items.length),
    [plan, weekNo],
  );
  if (!week) return null;
  const pct = (v) => (v == null ? '–' : `${Number(v)}%`);

  return (
    <div style={{ ...styles.card, padding: '14px 16px', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>
          Week {weekNo} · {shortDate(week.week_start)}
        </span>
        <PhaseChip phase={week.phase} />
        {weekNo === nowWeek && (
          <span style={{ fontSize: 12, fontWeight: 600, color: HP_ORANGE }}>This week</span>
        )}
        {events.map((e) => (
          <span key={e.id} style={{ fontSize: 13, color: '#45483F' }}>
            · {e.name}{e.priority ? ` (${e.priority})` : ''}{e.tentative ? ' — tentative' : ''}
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13, color: '#45483F' }}>
        <span>Volume <b>{pct(week.volume_pct)}</b></span>
        <span>Intensity <b>{pct(week.intensity_pct)}</b></span>
        <span>Planned hours <b>{week.hours_planned == null ? '–' : Number(week.hours_planned)}</b></span>
        <span style={{ color: '#8A8D84' }}>
          Physical {pct(week.physical_pct)} · Technique {pct(week.technique_pct)} · Tactical {pct(week.tactical_pct)} · Mental {pct(week.mental_pct)}
        </span>
      </div>
      {focus.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
          {focus.map((a) => (
            <div key={a.id} style={{ fontSize: 13 }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#8A8D84', marginBottom: 2 }}>{a.label}</div>
              {a.items.join(', ')}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: '#8A8D84' }}>No skills planned this week.</div>
      )}
    </div>
  );
}

function PlanEditor({ plan, planId, editing, onClose, onSaved }) {
  const { type, payload } = editing;
  const common = { weeks: plan.weeks, onClose, onSaved };
  if (type === 'cell') return <CellEditor row={payload.row} weekNo={payload.weekNo} {...common} />;
  if (type === 'phase') return <PhaseEditor planId={planId} weekNo={payload} {...common} />;
  if (type === 'numbers') return <NumbersEditor planId={planId} week={payload} {...common} />;
  if (type === 'events') return <EventsEditor planId={planId} weekNo={payload} events={plan.events} {...common} />;
  if (type === 'row') {
    const same = plan.rows.filter((r) => r.area === payload.area);
    const i = same.findIndex((r) => r.id === payload.id);
    return (
      <RowEditor
        row={payload} canUp={i > 0} canDown={i < same.length - 1}
        onMove={(dir) => swapRows(payload, same[i + dir])}
        onClose={onClose} onSaved={onSaved}
      />
    );
  }
  if (type === 'addRow') {
    const area = AREAS.find((a) => a.id === payload);
    return (
      <AddRowEditor
        planId={planId} area={payload} areaLabel={area.label}
        nextSort={Math.max(0, ...plan.rows.map((r) => r.sort)) + 1}
        existing={plan.rows.filter((r) => r.area === payload).map((r) => r.name)}
        onClose={onClose} onSaved={onSaved}
      />
    );
  }
  return null;
}
