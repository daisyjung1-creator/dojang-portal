// Weight for one HP athlete: weigh-ins, category limit, and the 8-week descent line before H competitions.
import React, { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { styles } from '../../lib/uiStyles';
import {
  WINDOW_DAYS, addDays, addWeight, daysBetween, deleteWeight, keyCompetitions, loadWeights, setWeightLimit,
  targetLine, weightStatus,
} from './hpWeight';
import { HP_ORANGE } from './ytpTheme';

export const WEIGHT_STATUS = {
  under: { text: 'On target', color: '#2A5A30', bg: '#E8F1E9' },
  on_track: { text: 'On track', color: '#2A5A30', bg: '#E8F1E9' },
  behind: { text: 'Above target line', color: '#7A5A00', bg: '#FFF1C9' },
  over: { text: 'Over limit — competition week', color: '#9A2B2B', bg: '#FBEAEA' },
  off: { text: 'Over limit', color: '#5B5F56', bg: '#EFEDE6' },
};

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shortDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

export function WeightChip({ result }) {
  const s = result?.status && WEIGHT_STATUS[result.status];
  if (!s) return null;
  return <span style={{ fontSize: 12, fontWeight: 600, color: s.color, background: s.bg, borderRadius: 999, padding: '2px 8px' }}>{s.text}</span>;
}

export default function WeightPanel({ athlete, plan, onAthleteChanged }) {
  const [weights, setWeights] = useState(null);
  const [error, setError] = useState('');
  const [f, setF] = useState({ date: todayIso(), kg: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [limitText, setLimitText] = useState(athlete.weight_limit == null ? '' : String(athlete.weight_limit));

  const reload = () => loadWeights([athlete.id]).then(setWeights).catch((e) => setError(e.message || String(e)));
  useEffect(() => { reload(); }, [athlete.id]);

  const limit = athlete.weight_limit == null ? null : Number(athlete.weight_limit);
  const comps = useMemo(() => (plan ? keyCompetitions(plan.events, plan.weeks) : []), [plan]);
  const today = todayIso();
  const result = weights && limit ? weightStatus(weights, comps, limit, today) : null;
  const kg = Number(f.kg.replace(',', '.'));
  const badKg = f.kg !== '' && !(kg >= 15 && kg <= 200);

  const add = () => {
    setBusy(true);
    addWeight(athlete.id, f.date, kg, f.note.trim())
      .then(() => { setF({ ...f, kg: '', note: '' }); return reload(); })
      .catch((e) => setError(e.message || String(e)))
      .finally(() => setBusy(false));
  };
  const saveLimit = () => {
    const v = limitText.trim() === '' ? null : Number(limitText);
    if (v != null && !(v > 0)) return;
    setWeightLimit(athlete.id, v).then(onAthleteChanged).catch((e) => setError(e.message || String(e)));
  };

  if (error) return <div style={{ ...styles.card, padding: 16, color: '#9A2B2B' }}>Couldn't load weights: {error}</div>;
  if (!weights) return <div style={{ color: '#5B5F56' }}>Loading...</div>;

  const next = comps.find((c) => c.date >= today);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ ...styles.card, padding: '14px 16px', display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 12, color: '#8A8D84' }}>Latest</div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>
            {result?.latest ? `${Number(result.latest.weight_kg)} kg` : weights.length ? `${Number(weights[weights.length - 1].weight_kg)} kg` : '–'}
          </div>
          {weights.length > 0 && <div style={{ fontSize: 12, color: '#8A8D84' }}>{shortDate(weights[weights.length - 1].date)}</div>}
        </div>
        <div>
          <div style={{ fontSize: 12, color: '#8A8D84' }}>Category limit</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input className="dp-input" inputMode="decimal" style={{ width: 70 }} value={limitText}
              onChange={(e) => setLimitText(e.target.value)} onBlur={() => limitText !== String(athlete.weight_limit ?? '') && saveLimit()} />
            <span>kg</span>
          </div>
        </div>
        {result?.over != null && result.over > 0 && (
          <div>
            <div style={{ fontSize: 12, color: '#8A8D84' }}>Over limit</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>+{result.over} kg</div>
          </div>
        )}
        {result?.target != null && (
          <div>
            <div style={{ fontSize: 12, color: '#8A8D84' }}>Target today</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{result.target} kg</div>
          </div>
        )}
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <WeightChip result={result} />
          <div style={{ fontSize: 12.5, color: '#5B5F56', marginTop: 4 }}>
            {next ? <>{next.name} · {shortDate(next.date)} · {Math.ceil(daysBetween(today, next.date) / 7)} weeks</> : 'No high-priority competition ahead'}
          </div>
        </div>
      </div>

      <div style={{ ...styles.card, padding: '12px 14px' }}>
        <WeightChart weights={weights} comps={comps} limit={limit} today={today} />
        <p style={{ fontSize: 12, color: '#8A8D84', margin: '6px 0 0' }}>
          Dashed line: target — down to the category limit over the {WINDOW_DAYS / 7} weeks before each high-priority (H) competition.
          Coach's standard; NCCP <em>Developing Athletic Abilities</em> has no weight guideline.
        </p>
      </div>

      <div style={{ ...styles.card, padding: '12px 14px' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label>
            <span style={{ display: 'block', fontSize: 12.5, color: '#5B5F56', marginBottom: 4 }}>Date</span>
            <input type="date" className="dp-input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </label>
          <label>
            <span style={{ display: 'block', fontSize: 12.5, color: '#5B5F56', marginBottom: 4 }}>Weight (kg)</span>
            <input className="dp-input" inputMode="decimal" style={{ width: 100 }} value={f.kg} onChange={(e) => setF({ ...f, kg: e.target.value.trim() })} />
          </label>
          <label style={{ flex: '1 1 180px' }}>
            <span style={{ display: 'block', fontSize: 12.5, color: '#5B5F56', marginBottom: 4 }}>Note</span>
            <input className="dp-input" style={{ width: '100%' }} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          </label>
          <button className="dp-btn dp-btn-primary" disabled={busy || !f.kg || badKg || !f.date} onClick={add}>Add weigh-in</button>
        </div>
        {badKg && <div style={{ color: '#9A2B2B', fontSize: 13, marginTop: 6 }}>Enter the weight in kg (e.g. 52.4).</div>}
        <div style={{ marginTop: 10 }}>
          {[...weights].reverse().map((w) => (
            <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0', borderBottom: '1px solid #F1EEE6', fontSize: 14 }}>
              <span style={{ width: 64, color: '#5B5F56' }}>{shortDate(w.date)}</span>
              <b style={{ width: 70 }}>{Number(w.weight_kg)} kg</b>
              {limit && <span style={{ fontSize: 12.5, color: Number(w.weight_kg) > limit ? '#9A2B2B' : '#2A5A30' }}>
                {Number(w.weight_kg) > limit ? `+${Math.round((w.weight_kg - limit) * 10) / 10}` : 'under'}
              </span>}
              <span style={{ flex: 1, fontSize: 13, color: '#8A8D84' }}>{w.note}</span>
              <button className="dp-btn" style={{ padding: 6, border: 'none' }} aria-label="Delete weigh-in"
                onClick={() => deleteWeight(w.id).then(reload)}><Trash2 size={15} /></button>
            </div>
          ))}
          {!weights.length && <div style={{ fontSize: 13, color: '#8A8D84' }}>No weigh-ins yet.</div>}
        </div>
      </div>
    </div>
  );
}

function WeightChart({ weights, comps, limit, today }) {
  if (!weights.length && !limit) return <div style={{ fontSize: 13, color: '#8A8D84' }}>Add a weigh-in to see the chart.</div>;
  const W = 760;
  const H = 220;
  const pad = { l: 40, r: 12, t: 12, b: 26 };
  const next = comps.find((c) => c.date >= today);
  const first = weights[0]?.date || today;
  const startDate = [first, addDays(today, -28)].sort()[0];
  const endDate = [addDays(today, 28), next?.date || today, weights[weights.length - 1]?.date || today].sort().reverse()[0];
  const span = Math.max(1, daysBetween(startDate, endDate));
  const vals = [...weights.map((w) => Number(w.weight_kg)), ...(limit ? [limit] : [])];
  const lines = limit ? comps.map((c) => targetLine(weights, c, limit)).filter(Boolean) : [];
  lines.forEach((l) => vals.push(l.from));
  const lo = Math.floor(Math.min(...vals) - 1);
  const hi = Math.ceil(Math.max(...vals) + 1);
  const x = (d) => pad.l + (daysBetween(startDate, d) / span) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const ticks = [];
  for (let v = lo; v <= hi; v += Math.max(1, Math.round((hi - lo) / 5))) ticks.push(v);
  const months = [];
  for (let d = startDate.slice(0, 8) + '01'; d <= endDate; d = addDays(d, 32).slice(0, 8) + '01') if (d >= startDate) months.push(d);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Weight over time">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="#EFECE3" />
          <text x={pad.l - 6} y={y(v) + 4} fontSize="11" textAnchor="end" fill="#8A8D84">{v}</text>
        </g>
      ))}
      {months.map((d) => (
        <text key={d} x={x(d)} y={H - 8} fontSize="11" fill="#8A8D84">
          {new Date(`${d}T00:00:00`).toLocaleString('en-CA', { month: 'short' })}
        </text>
      ))}
      {comps.filter((c) => c.date >= startDate && c.date <= endDate).map((c) => (
        <g key={c.name + c.date}>
          <rect x={x(addDays(c.date, -WINDOW_DAYS))} y={pad.t} width={x(c.date) - x(addDays(c.date, -WINDOW_DAYS))} height={H - pad.t - pad.b} fill="#FDF0E6" />
          <line x1={x(c.date)} x2={x(c.date)} y1={pad.t} y2={H - pad.b} stroke="#9A2B2B" strokeWidth="1.5" />
          <text x={x(c.date) - 4} y={pad.t + 12} fontSize="11" textAnchor="end" fill="#9A2B2B">{c.name}</text>
        </g>
      ))}
      {limit && (
        <g>
          <line x1={pad.l} x2={W - pad.r} y1={y(limit)} y2={y(limit)} stroke="#9A2B2B" strokeDasharray="2 3" />
          <text x={pad.l + 4} y={y(limit) - 4} fontSize="11" fill="#9A2B2B">Limit {limit} kg</text>
        </g>
      )}
      {lines.map((l) => (
        <line key={l.comp.date} x1={x(l.start)} y1={y(l.from)} x2={x(l.end)} y2={y(l.to)} stroke={HP_ORANGE} strokeWidth="2" strokeDasharray="6 4" />
      ))}
      <line x1={x(today)} x2={x(today)} y1={pad.t} y2={H - pad.b} stroke="#20241F" strokeOpacity="0.25" />
      {weights.length > 1 && (
        <polyline fill="none" stroke="#20241F" strokeWidth="2"
          points={weights.map((w) => `${x(w.date)},${y(Number(w.weight_kg))}`).join(' ')} />
      )}
      {weights.map((w) => (
        <circle key={w.id} cx={x(w.date)} cy={y(Number(w.weight_kg))} r="3.5"
          fill={limit && Number(w.weight_kg) > limit ? '#20241F' : '#2A5A30'} />
      ))}
    </svg>
  );
}
