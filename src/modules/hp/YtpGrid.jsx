import React, { useEffect, useMemo, useRef } from 'react';
import { AREAS, CODE_LABELS, runs, monthLabel } from './ytpData';
import { CODE_STYLE, HP_ORANGE, KIND_STYLE, PHASE_STYLE, PRIORITY_STYLE } from './ytpTheme';

const LABEL_W = 168;
const COL_W = 36;

const NUMBER_ROWS = [
  { key: 'volume_pct', label: 'Volume %', heat: true },
  { key: 'intensity_pct', label: 'Intensity %', heat: true },
  { key: 'physical_pct', label: 'Physical %', factor: true },
  { key: 'technique_pct', label: 'Technique %', factor: true },
  { key: 'tactical_pct', label: 'Tactical %', factor: true },
  { key: 'mental_pct', label: 'Mental %', factor: true },
  { key: 'hours_planned', label: 'Planned hours' },
];

// Performance factors that are filled in but don't add up to 100%.
function factorOff(w) {
  const vals = ['physical_pct', 'technique_pct', 'tactical_pct', 'mental_pct'].map((k) => w[k]);
  if (vals.every((v) => v == null)) return false;
  const sum = vals.reduce((s, v) => s + (v == null ? 0 : Number(v)), 0);
  return sum !== 0 && sum !== 100;
}

function fmt(v) {
  if (v == null) return '';
  const n = Number(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
}

export default function YtpGrid({ plan, nowWeek, selectedWeek, onSelectWeek, editMode = false, onEdit }) {
  const scrollRef = useRef(null);
  const { weeks, events, rows } = plan;

  const eventsByWeek = useMemo(() => {
    const m = {};
    events.forEach((e) => (m[e.week_no] ||= []).push(e));
    return m;
  }, [events]);
  const monthRuns = useMemo(() => runs(weeks, (w) => monthLabel(w.week_start)), [weeks]);
  const phaseRuns = useMemo(() => runs(weeks, (w) => w.phase || ''), [weeks]);

  // Open on this week (a couple of weeks of context to its left) — only when a plan is first shown,
  // so saving a change doesn't jump the table back.
  const planId = weeks[0]?.plan_id;
  const scrolledFor = useRef(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || scrolledFor.current === planId) return;
    scrolledFor.current = planId;
    if (nowWeek) el.scrollLeft = Math.max(0, (nowWeek - 3) * COL_W);
  }, [nowWeek, planId]);

  const edit = (type, payload) => editMode && onEdit && onEdit(type, payload);

  const colClass = (w) =>
    ['ytp-c', w === nowWeek ? 'ytp-now' : '', w === selectedWeek ? 'ytp-sel' : ''].join(' ');

  return (
    <div className={`ytp-scroll${editMode ? ' ytp-editing' : ''}`} ref={scrollRef}>
      <style>{CSS}</style>
      <table className="ytp-table" style={{ width: LABEL_W + weeks.length * COL_W }}>
        <colgroup>
          <col style={{ width: LABEL_W }} />
          {weeks.map((w) => <col key={w.week_no} style={{ width: COL_W }} />)}
        </colgroup>
        <tbody>
          <tr className="ytp-month">
            <th className="ytp-label">Month</th>
            {monthRuns.map((r) => <td key={r.start} colSpan={r.span}>{r.key}</td>)}
          </tr>
          <tr className="ytp-weekno">
            <th className="ytp-label">Week</th>
            {weeks.map((w) => (
              <td key={w.week_no} className={colClass(w.week_no)}>
                <button type="button" onClick={() => onSelectWeek(w.week_no)} aria-label={`Week ${w.week_no}`}>
                  {w.week_no}
                </button>
              </td>
            ))}
          </tr>
          <tr className="ytp-day">
            <th className="ytp-label">Monday</th>
            {weeks.map((w) => (
              <td key={w.week_no} className={colClass(w.week_no)}>{Number(w.week_start.slice(8, 10))}</td>
            ))}
          </tr>
          <tr className="ytp-events">
            <th className="ytp-label">Events</th>
            {weeks.map((w) => (
              <td
                key={w.week_no}
                className={`${colClass(w.week_no)} ytp-tap`}
                onClick={() => (editMode ? edit('events', w.week_no) : onSelectWeek(w.week_no))}
              >
                <div className="ytp-evstack">
                  {(eventsByWeek[w.week_no] || []).map((e) => {
                    const k = KIND_STYLE[e.kind] || KIND_STYLE.other;
                    const p = e.priority && PRIORITY_STYLE[e.priority];
                    return (
                      <span
                        key={e.id}
                        className="ytp-ev"
                        title={`${e.name}${e.priority ? ` (priority ${e.priority})` : ''}${e.tentative ? ' — tentative' : ''}`}
                        style={{ background: k.bg, borderColor: k.border, borderStyle: e.tentative ? 'dashed' : 'solid' }}
                      >
                        {p && <b style={{ background: p.bg, color: p.fg }}>{e.priority}</b>}
                        {e.name}
                      </span>
                    );
                  })}
                </div>
              </td>
            ))}
          </tr>
          <tr className="ytp-phase">
            <th className="ytp-label">Phase</th>
            {editMode
              ? weeks.map((w) => {
                  const s = PHASE_STYLE[w.phase] || { bg: '#FFFFFF', fg: '#8A8D84', short: '+' };
                  return (
                    <td key={w.week_no} className="ytp-tap" style={{ background: s.bg, color: s.fg }} title={w.phase || 'No phase'}
                      onClick={() => edit('phase', w.week_no)}>
                      {s.short}
                    </td>
                  );
                })
              : phaseRuns.map((r) => {
                  const s = PHASE_STYLE[r.key] || { bg: '#FFFFFF', fg: '#20241F', short: '' };
                  return (
                    <td key={r.start} colSpan={r.span} style={{ background: s.bg, color: s.fg }} title={r.key}>
                      {r.span >= 3 ? r.key : s.short}
                    </td>
                  );
                })}
          </tr>

          {AREAS.map((area) => {
            const areaRows = rows.filter((r) => r.area === area.id);
            if (!areaRows.length && !editMode) return null;
            return (
              <React.Fragment key={area.id}>
                <tr className="ytp-section">
                  <th className="ytp-label">
                    {area.label}
                    {editMode && (
                      <button type="button" className="ytp-add" onClick={() => edit('addRow', area.id)}>+ Add</button>
                    )}
                  </th>
                  <td colSpan={weeks.length} />
                </tr>
                {areaRows.map((r) => (
                  <tr key={r.id} className="ytp-skill">
                    <th className={`ytp-label${editMode ? ' ytp-tap' : ''}`} title={r.name} onClick={() => edit('row', r)}>
                      {r.name}{editMode && <span className="ytp-pen">✎</span>}
                    </th>
                    {weeks.map((w) => {
                      const code = r.cells[w.week_no];
                      const s = code && CODE_STYLE[code];
                      return (
                        <td
                          key={w.week_no}
                          className={`${colClass(w.week_no)}${editMode ? ' ytp-tap' : ''}`}
                          title={code ? `${r.name} · week ${w.week_no}: ${CODE_LABELS[code]}` : undefined}
                          onClick={() => edit('cell', { row: r, weekNo: w.week_no })}
                        >
                          {code && (
                            <span className="ytp-code" style={{ background: s.bg, color: s.fg }}>
                              {code === 'X' ? '●' : code}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </React.Fragment>
            );
          })}

          <tr className="ytp-section">
            <th className="ytp-label">Loading</th>
            <td colSpan={weeks.length} />
          </tr>
          {NUMBER_ROWS.map((nr) => (
            <tr key={nr.key} className="ytp-num">
              <th className="ytp-label">{nr.label}</th>
              {weeks.map((w) => {
                const v = w[nr.key];
                const heat = nr.heat && v != null ? `rgba(232,112,42,${(Number(v) / 100) * 0.55})` : undefined;
                return (
                  <td
                    key={w.week_no}
                    className={`${colClass(w.week_no)}${editMode ? ' ytp-tap' : ''}${nr.factor && factorOff(w) ? ' ytp-warn' : ''}`}
                    style={heat ? { background: heat } : undefined}
                    onClick={() => edit('numbers', w)}
                  >
                    {fmt(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function YtpLegend() {
  return (
    <div className="ytp-legend">
      <div>
        <strong>Skill stage</strong>
        {['I', 'D', 'C', 'R'].map((c) => (
          <span key={c}><i style={{ background: CODE_STYLE[c].bg, color: CODE_STYLE[c].fg }}>{c}</i>{CODE_LABELS[c]}</span>
        ))}
      </div>
      <div>
        <strong>Physical</strong>
        <span><i style={{ background: CODE_STYLE.D.bg, color: CODE_STYLE.D.fg }}>D</i>Development</span>
        <span><i style={{ background: CODE_STYLE.M.bg, color: CODE_STYLE.M.fg }}>M</i>Maintenance</span>
        <strong style={{ marginLeft: 8 }}>Mental</strong>
        <span><i style={{ color: HP_ORANGE }}>●</i>Trained this week</span>
      </div>
      <div>
        <strong>Events</strong>
        <span><i style={{ background: PRIORITY_STYLE.H.bg, color: '#fff' }}>H</i>High</span>
        <span><i style={{ background: PRIORITY_STYLE.M.bg, color: '#fff' }}>M</i>Medium</span>
        <span><i style={{ background: PRIORITY_STYLE.L.bg }}>L</i>Low</span>
        <span><i style={{ border: '1px dashed #8A8D84', width: 18 }} />Tentative</span>
      </div>
      <p>Terms follow NCCP <em>Developing Athletic Abilities</em> (Appendix B; section 5.3 for development vs. maintenance).</p>
    </div>
  );
}

const CSS = `
.ytp-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; background: #fff; border: 1px solid #DEDACC; border-radius: 10px; }
.ytp-table { border-collapse: separate; border-spacing: 0; table-layout: fixed; font-size: 12px; }
.ytp-table td, .ytp-table th { border-right: 1px solid #EFECE3; border-bottom: 1px solid #EFECE3; padding: 0; text-align: center; height: 28px; }
.ytp-label { position: sticky; left: 0; z-index: 2; background: #FAF8F3; text-align: left !important; padding: 0 10px !important;
  font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-right: 1px solid #DEDACC !important; }
.ytp-month td { font-weight: 600; text-align: left; padding-left: 6px; color: #20241F; border-right: 1px solid #DEDACC; }
.ytp-weekno button { all: unset; cursor: pointer; display: block; width: 100%; height: 28px; line-height: 28px; color: #5B5F56; }
.ytp-day td { color: #8A8D84; font-size: 11px; }
.ytp-events td { height: 196px; vertical-align: bottom; cursor: pointer; }
.ytp-evstack { display: flex; justify-content: center; gap: 2px; padding: 4px 0; }
.ytp-ev { writing-mode: vertical-rl; transform: rotate(180deg); border: 1.5px solid; border-radius: 6px; padding: 5px 2px;
  font-size: 11px; font-weight: 500; white-space: nowrap; max-height: 188px; overflow: hidden; text-overflow: ellipsis; color: #20241F; }
.ytp-ev b { display: inline-block; border-radius: 3px; padding: 2px 0; margin-bottom: 4px; font-size: 10px; }
.ytp-phase td { font-size: 11px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 4px; border-right: 2px solid #fff; }
.ytp-section th, .ytp-section td { background: #F3F0E8; height: 24px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #5B5F56; }
.ytp-code { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 20px; border-radius: 4px; font-weight: 700; font-size: 11px; }
.ytp-num td { color: #20241F; font-variant-numeric: tabular-nums; font-size: 11.5px; }
.ytp-table td.ytp-now { box-shadow: inset 2px 0 0 ${HP_ORANGE}, inset -2px 0 0 ${HP_ORANGE}; }
.ytp-weekno td.ytp-now button { background: ${HP_ORANGE}; color: #fff; font-weight: 700; }
.ytp-table td.ytp-sel:not(.ytp-now) { background-color: rgba(32,36,31,0.05); }
.ytp-weekno td.ytp-sel:not(.ytp-now) button { background: #20241F; color: #fff; }
.ytp-editing .ytp-tap { cursor: pointer; }
.ytp-editing td.ytp-tap:hover, .ytp-editing th.ytp-tap:hover { outline: 2px solid ${HP_ORANGE}; outline-offset: -2px; }
.ytp-editing .ytp-skill td.ytp-tap:empty::after { content: '+'; color: #D8D3C4; }
.ytp-pen { color: ${HP_ORANGE}; margin-left: 6px; font-size: 11px; }
.ytp-add { all: unset; cursor: pointer; margin-left: 8px; color: ${HP_ORANGE}; font-weight: 700; text-transform: none; letter-spacing: 0; font-size: 12px; }
td.ytp-warn { background: #FFF1C9 !important; }
.ytp-legend { display: flex; flex-direction: column; gap: 8px; margin-top: 14px; font-size: 12.5px; color: #45483F; }
.ytp-legend > div { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; }
.ytp-legend strong { color: #20241F; min-width: 84px; }
.ytp-legend span { display: inline-flex; align-items: center; gap: 6px; }
.ytp-legend i { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 18px; border-radius: 4px; font-style: normal; font-weight: 700; font-size: 11px; }
.ytp-legend p { margin: 4px 0 0; color: #8A8D84; font-size: 12px; }
`;
