// Test results for one HP athlete: latest value, change since the previous test, left/right difference.
import React, { useEffect, useMemo, useState } from 'react';
import { styles } from '../../lib/uiStyles';
import { asymmetry, fmtValue, loadStudentResults, sideKey, summarize } from './fitTests';
import { HP_ORANGE } from './ytpTheme';

const TREND = {
  better: { color: 'var(--dp-success)', bg: 'var(--dp-success-tint)' },
  worse: { color: 'var(--dp-danger)', bg: 'var(--dp-danger-tint)' },
  same: { color: 'var(--dp-ink-soft)', bg: 'var(--dp-canvas)' },
};
// Left/right difference worth a look (NCCP DAA 4.2: asymmetries raise injury risk). The document gives no number.
const ASYM_FLAG = 10;

function shortDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: '2-digit' });
}

function Spark({ history }) {
  if (history.length < 2) return null;
  const vals = history.map((h) => h.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const w = 64;
  const h = 20;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${max === min ? h / 2 : h - ((v - min) / (max - min)) * h}`);
  return (
    <svg width={w} height={h + 4} style={{ overflow: 'visible' }} aria-hidden="true">
      <polyline points={pts.join(' ')} fill="none" style={{ stroke: HP_ORANGE }} strokeWidth="1.5" />
      {pts.map((p) => { const [x, y] = p.split(','); return <circle key={p} cx={x} cy={y} r="2" style={{ fill: HP_ORANGE }} />; })}
    </svg>
  );
}

function Change({ s, unit }) {
  if (!s?.previous) return <span style={{ fontSize: 12, color: 'var(--dp-ink-faint)' }}>{s?.latest ? 'first test' : ''}</span>;
  const t = TREND[s.trend] || TREND.same;
  const sign = s.change > 0 ? '+' : '';
  return (
    <span style={{ fontSize: 12, fontWeight: 600, color: t.color, background: t.bg, borderRadius: 999, padding: '1px 7px', whiteSpace: 'nowrap' }}>
      {sign}{fmtValue(s.change)}{unit && unit.length <= 5 ? ` ${unit}` : ''}
      {s.changePct != null && <span style={{ fontWeight: 400 }}> ({sign}{Math.round(s.changePct)}%)</span>}
    </span>
  );
}

export default function TestsPanel({ studentId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!studentId) return;
    loadStudentResults(studentId).then(setData).catch((e) => setError(e.message || String(e)));
  }, [studentId]);

  const summary = useMemo(() => (data ? summarize(data.items, data.results) : null), [data]);
  const dates = useMemo(() => (data ? [...new Set(data.results.map((r) => r.test_date))].sort() : []), [data]);

  if (!studentId) return <div style={{ ...styles.card, padding: 16, color: 'var(--dp-danger)' }}>Not linked to a student record.</div>;
  if (error) return <div style={{ ...styles.card, padding: 16, color: 'var(--dp-danger)' }}>Couldn't load tests: {error}</div>;
  if (!data) return <div style={{ color: 'var(--dp-ink-soft)' }}>Loading...</div>;
  if (!dates.length) {
    return <div style={{ ...styles.card, padding: 16, color: 'var(--dp-ink-soft)' }}>No test results yet. Enter them on HP Plans → Fitness Tests.</div>;
  }

  const categories = [...new Set(data.items.map((i) => i.category))];
  return (
    <>
      <p style={{ fontSize: 13, color: 'var(--dp-ink-soft)', margin: '0 0 10px' }}>
        {dates.length} test day{dates.length > 1 ? 's' : ''}: {dates.map(shortDate).join(' · ')}. Change is since the previous test.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 12 }}>
        {categories.map((cat) => (
          <div key={cat} style={{ ...styles.card, padding: '12px 14px' }}>
            <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--dp-ink-faint)', marginBottom: 6 }}>{cat}</div>
            {data.items.filter((i) => i.category === cat).map((item) => {
              const sides = item.sides ? ['L', 'R'] : [''];
              const asym = item.sides ? asymmetry(summary, item) : null;
              return (
                <div key={item.key} style={{ padding: '6px 0', borderBottom: '1px solid var(--dp-line)' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 14 }}>
                    <span style={{ fontWeight: 500 }}>{item.name}</span>
                    {item.unit && <span style={{ fontSize: 12, color: 'var(--dp-ink-faint)' }}>{item.unit}</span>}
                    {asym != null && (
                      <span style={{ marginLeft: 'auto', fontSize: 12, color: asym >= ASYM_FLAG ? 'var(--dp-warning)' : 'var(--dp-ink-faint)',
                        background: asym >= ASYM_FLAG ? 'var(--dp-warning-tint)' : 'transparent', borderRadius: 999, padding: '0 6px' }}>
                        L/R diff {Math.round(asym)}%
                      </span>
                    )}
                  </div>
                  {sides.map((side) => {
                    const s = summary[sideKey(item.key, side)];
                    return (
                      <div key={side} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, fontSize: 13 }}>
                        {side && <span style={{ width: 14, color: 'var(--dp-ink-faint)' }}>{side}</span>}
                        <b style={{ minWidth: 44, fontVariantNumeric: 'tabular-nums' }}>{s?.latest ? fmtValue(s.latest.value) : '–'}</b>
                        <Change s={s} unit={item.unit} />
                        <span style={{ marginLeft: 'auto' }}><Spark history={s?.history || []} /></span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {data.notes.length > 0 && (
        <div style={{ ...styles.card, padding: '12px 14px', marginTop: 12, fontSize: 13 }}>
          {data.notes.map((n) => <div key={n.test_date}><b>{shortDate(n.test_date)}</b> — {n.note}</div>)}
        </div>
      )}
      <p style={{ fontSize: 12, color: 'var(--dp-ink-faint)', marginTop: 10 }}>
        Green = improved, red = got worse (by each test's direction; growth has none). L/R differences of {ASYM_FLAG}% or more are highlighted —
        NCCP <em>Developing Athletic Abilities</em> 4.2 treats asymmetry as an injury risk but gives no cut-off.
      </p>
    </>
  );
}
