import React, { useMemo, useState } from 'react';
import { Shuffle, Plus, Trash2, Printer, ArrowLeftRight } from 'lucide-react';
import { styles } from '../../lib/uiStyles';
import { makePairs } from '../../lib/testScoring';
import { beltIndex } from '../../lib/beltTesting';

// Sparring pairings for the test: everyone on the list from Yellow belt up,
// matched by belt then age. Change any match by hand; saved with the test.
const YELLOW = beltIndex('Yellow');
const ageOf = (dob, on) => (dob ? Math.floor((new Date(on) - new Date(dob)) / (365.25 * 86400000)) : null);

export default function SparringView({ rows, test, onSave, onPrint }) {
  const fighters = useMemo(
    () => rows.filter(({ e }) => beltIndex(e.current_belt) >= YELLOW).map(({ e, s }) => ({ id: s.id, s, e, beltIndex: beltIndex(e.current_belt), age: ageOf(s.dob, test.test_date) })),
    [rows, test.test_date]
  );
  const byId = Object.fromEntries(fighters.map((f) => [f.id, f]));
  const [pairs, setPairs] = useState(test.bracket || []);
  const [sure, setSure] = useState(false);

  const save = (next) => {
    setPairs(next);
    onSave(next);
  };
  const generate = () => {
    save(makePairs(fighters));
    setSure(false);
  };
  const setSide = (i, side, id) => save(pairs.map((p, k) => (k === i ? { ...p, [side]: id || null } : p)));
  const count = {};
  pairs.forEach((p) => [p.red, p.blue].forEach((id) => id && (count[id] = (count[id] || 0) + 1)));
  const missing = fighters.filter((f) => !count[f.id]);

  const Person = ({ id, side, i }) => {
    const f = byId[id];
    return (
      <div style={{ flex: 1, borderLeft: `5px solid ${side === 'red' ? '#BF1C21' : '#1E4566'}`, paddingLeft: 10 }}>
        <select className="dp-select" style={{ width: '100%', fontSize: 13.5 }} value={id || ''} onChange={(ev) => setSide(i, side, ev.target.value)}>
          <option value="">— pick —</option>
          {fighters.map((x) => (
            <option key={x.id} value={x.id}>{x.s.name} · {x.e.current_belt}{x.age != null ? ` · ${x.age}y` : ''}</option>
          ))}
        </select>
        {f && (
          <div style={{ fontSize: 11.5, color: '#8A8D84', marginTop: 2 }}>
            {f.e.current_belt}{f.age != null ? ` · age ${f.age}` : ''}{count[id] > 1 ? ` · ${count[id]} matches` : ''}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        {pairs.length && !sure ? (
          <button className="dp-btn" onClick={() => setSure(true)}><Shuffle size={15} /> Make new pairings</button>
        ) : (
          <button className="dp-btn dp-btn-primary" disabled={fighters.length < 2} onClick={generate}><Shuffle size={15} /> {pairs.length ? 'Yes, replace the pairings' : 'Make pairings'}</button>
        )}
        {sure && <button className="dp-btn" onClick={() => setSure(false)}>Cancel</button>}
        <button className="dp-btn" onClick={() => save([...pairs, { red: null, blue: null }])}><Plus size={15} /> Add match</button>
        <button className="dp-btn" disabled={!pairs.length} onClick={() => onPrint(pairs)}><Printer size={15} /> Print pairings</button>
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5B5F56' }}>{fighters.length} sparring (Yellow belt and up) · {pairs.length} matches</span>
      </div>

      {missing.length > 0 && pairs.length > 0 && (
        <p style={{ background: '#FAEEDA', color: '#854F0B', padding: '7px 12px', borderRadius: 6, fontSize: 12.5, margin: '0 0 10px' }}>
          Not in a match yet: {missing.map((f) => f.s.name).join(', ')}
        </p>
      )}

      <div style={styles.card}>
        {pairs.length === 0 ? (
          <p style={{ padding: 20, color: '#5B5F56', fontSize: 14, margin: 0 }}>
            {fighters.length < 2 ? 'Fewer than two students from Yellow belt up on this test.' : '“Make pairings” matches everyone from Yellow belt up by belt, then age. You can change any match afterwards.'}
          </p>
        ) : (
          pairs.map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: i < pairs.length - 1 ? '1px solid #F1EFE7' : 'none' }}>
              <span style={{ width: 26, fontWeight: 700, fontSize: 15, color: '#5B5F56' }}>{i + 1}</span>
              <Person id={p.red} side="red" i={i} />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <ScoreBox value={p.rs} color="#BF1C21" label="Red score" onSave={(v) => save(pairs.map((x, k) => (k === i ? { ...x, rs: v } : x)))} />
                  <b style={{ fontSize: 16 }}>:</b>
                  <ScoreBox value={p.bs} color="#1E4566" label="Blue score" onSave={(v) => save(pairs.map((x, k) => (k === i ? { ...x, bs: v } : x)))} />
                </div>
                <button className="dp-btn" style={{ padding: '1px 6px', fontSize: 11 }} aria-label="Swap sides" title="Swap red / blue" onClick={() => save(pairs.map((x, k) => (k === i ? { ...x, red: x.blue, blue: x.red, rs: x.bs, bs: x.rs } : x)))}><ArrowLeftRight size={12} /> swap</button>
              </div>
              <Person id={p.blue} side="blue" i={i} />
              <button className="dp-btn" style={{ padding: 5 }} aria-label="Remove match" onClick={() => save(pairs.filter((_, k) => k !== i))}><Trash2 size={13} /></button>
            </div>
          ))
        )}
      </div>
      <p style={{ fontSize: 12, color: '#8A8D84', marginTop: 8 }}>Red = Hong, Blue = Chung. Saved automatically with this test.</p>
    </>
  );
}

// Score for one side; saves when you leave the box.
function ScoreBox({ value, color, label, onSave }) {
  const [v, setV] = useState(value ?? '');
  React.useEffect(() => setV(value ?? ''), [value]);
  return (
    <input
      className="dp-input"
      inputMode="numeric"
      aria-label={label}
      value={v}
      onChange={(e) => setV(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
      onBlur={() => String(v) !== String(value ?? '') && onSave(v === '' ? null : Number(v))}
      style={{ width: 46, textAlign: 'center', fontSize: 17, fontWeight: 700, padding: '4px 2px', color, borderColor: color }}
    />
  );
}
