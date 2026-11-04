import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';

// How well `query` matches `text` (higher is better, null = no match).
// Handles whole words, word starts ("ang" → Angel), several words in any order
// ("alvarez angel"), letters in order ("anglz") and small typos ("agnel").
export function matchScore(query, text) {
  const q = norm(query);
  const t = norm(text);
  if (!q) return 0;
  if (!t) return null;
  if (t.startsWith(q)) return 100;
  const words = t.split(' ');
  if (words.some((w) => w.startsWith(q))) return 92;
  if (t.includes(q)) return 85;

  const parts = q.split(' ');
  if (parts.length > 1) {
    const scores = parts.map((p) => matchScore(p, t));
    if (scores.every((s) => s !== null)) return Math.min(...scores) - 5;
    return null;
  }

  // Typos: compare with the start of each word.
  if (q.length >= 3) {
    const allowed = q.length >= 7 ? 2 : 1;
    let best = Infinity;
    for (const w of words) {
      best = Math.min(best, distance(q, w.slice(0, q.length)), distance(q, w));
    }
    if (best <= allowed) return 60 - best * 10;
  }

  // Letters in order, e.g. "mzia" → Mohammad Zia.
  let i = 0;
  for (const ch of t) if (ch === q[i]) i++;
  if (i === q.length && q.length >= 3) return 35;
  return null;
}

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9@.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Damerau-Levenshtein (adjacent swaps count as one edit).
function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

// A dropdown you can type into. options: [{ value, label, hint?, keywords? }]
// `keywords` are searched but not shown (e.g. email, phone, student names);
// `hint` is shown in grey under the label.
export default function SearchSelect({ options, value, onChange, placeholder = 'Type to search…', disabled, style, emptyLabel, allowClear = true, inputStyle }) {
  const selected = options.find((o) => o.value === value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const results = useMemo(() => {
    if (!query.trim()) return options.slice(0, 200);
    return options
      .map((o) => {
        const a = matchScore(query, o.label);
        const b = o.keywords ? matchScore(query, o.keywords) : null;
        const s = Math.max(a ?? -1, b === null ? -1 : b - 3);
        return s < 0 ? null : { o, s };
      })
      .filter(Boolean)
      .sort((x, y) => y.s - x.s || x.o.label.localeCompare(y.o.label))
      .slice(0, 50)
      .map((r) => r.o);
  }, [options, query]);

  useEffect(() => setActive(0), [query]);

  // The list floats above the pop-up window so it isn't cut off by scrolling.
  function place() {
    if (inputRef.current) setRect(inputRef.current.getBoundingClientRect());
  }
  useEffect(() => {
    if (!open) return;
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    const el = listRef.current?.children[active];
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function choose(o) {
    onChange(o ? o.value : '');
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && results[active]) {
        e.preventDefault();
        choose(results[active]);
      }
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      setOpen(false);
      setQuery('');
    }
  }

  const spaceBelow = rect ? window.innerHeight - rect.bottom : 300;
  const above = rect && spaceBelow < 220 && rect.top > spaceBelow;

  return (
    <div style={{ position: 'relative', ...style }}>
      <input
        ref={inputRef}
        className="dp-input"
        style={{ width: '100%', paddingRight: 46, ...inputStyle }}
        disabled={disabled}
        placeholder={selected ? selected.label : placeholder}
        value={open ? query : selected?.label || ''}
        onFocus={(e) => {
          setOpen(true);
          setQuery('');
          e.target.select();
        }}
        onBlur={() => setTimeout(() => { setOpen(false); setQuery(''); }, 120)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        autoComplete="off"
      />
      <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: 2, alignItems: 'center', color: '#8A8D84' }}>
        {allowClear && selected && !disabled && (
          <button type="button" aria-label="Clear" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(null)} style={{ border: 'none', background: 'none', padding: 2, cursor: 'pointer', color: '#8A8D84', display: 'flex' }}>
            <X size={13} />
          </button>
        )}
        <ChevronDown size={14} style={{ pointerEvents: 'none' }} />
      </span>
      {open && rect && (
        <div
          ref={listRef}
          onMouseDown={(e) => e.preventDefault()}
          style={{
            position: 'fixed',
            left: rect.left,
            width: Math.max(rect.width, 240),
            ...(above ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
            maxHeight: Math.min(300, Math.max(above ? rect.top - 16 : spaceBelow - 16, 120)),
            overflowY: 'auto',
            background: '#FFFFFF',
            border: '1px solid #DEDACC',
            borderRadius: 8,
            boxShadow: '0 6px 20px rgba(32,36,31,0.15)',
            zIndex: 2000,
            padding: 4,
          }}
        >
          {results.length === 0 ? (
            <div style={{ padding: '8px 10px', fontSize: 13, color: '#8A8D84' }}>{emptyLabel || 'No match'}</div>
          ) : (
            results.map((o, i) => (
              <div
                key={o.value}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(o)}
                style={{ padding: '6px 10px', borderRadius: 6, cursor: 'pointer', background: i === active ? '#F1EEE4' : o.value === value ? '#FAF8F2' : 'transparent' }}
              >
                <div style={{ fontSize: 13.5, color: '#20241F', fontWeight: o.value === value ? 500 : 400 }}>{o.label}</div>
                {o.hint && <div style={{ fontSize: 12, color: '#8A8D84' }}>{o.hint}</div>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
