import React, { useState } from 'react';
import { splitClasses, joinClasses } from '../lib/classes';

// Pick one or more classes. `value` / `onChange` use the comma-separated string
// stored in students.class_name.
export default function ClassPicker({ value, onChange, options }) {
  const selected = splitClasses(value);
  const [other, setOther] = useState('');
  const all = Array.from(new Set([...options, ...selected]));

  function toggle(c) {
    onChange(joinClasses(selected.includes(c) ? selected.filter((x) => x !== c) : [...selected, c]));
  }
  function addOther() {
    const c = other.replace(/,/g, ' ').trim();
    if (!c) return;
    onChange(joinClasses([...selected, c]));
    setOther('');
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {all.map((c) => {
          const on = selected.includes(c);
          return (
            <button
              type="button"
              key={c}
              className="dp-btn"
              onClick={() => toggle(c)}
              style={{ padding: '4px 10px', fontSize: 12.5, background: on ? '#20241F' : '#fff', color: on ? '#fff' : '#20241F', borderColor: on ? '#20241F' : '#DEDACC' }}
            >
              {on ? '✓ ' : ''}
              {c}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <input
          className="dp-input"
          style={{ flex: 1, padding: '5px 8px', fontSize: 13 }}
          placeholder="Other class…"
          value={other}
          onChange={(e) => setOther(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addOther();
            }
          }}
        />
        <button type="button" className="dp-btn" style={{ padding: '4px 10px', fontSize: 12.5 }} onClick={addOther} disabled={!other.trim()}>
          Add
        </button>
      </div>
    </div>
  );
}
