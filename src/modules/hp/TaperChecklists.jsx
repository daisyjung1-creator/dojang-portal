// "Taper" tab: one logistics checklist per competition, shared by every HP athlete going to it.
import React, { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import { HP_ORANGE } from './ytpTheme';

async function must(promise) {
  const { data, error } = await promise;
  if (error) throw error;
  return data || [];
}

const compKey = (e) => `${e.name}|${e.week_no}`;

function prettyDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Competitions from every plan, merged by name + week. */
function competitionsFrom(overview) {
  const map = new Map();
  overview.athletes.forEach((a) => {
    a.events.filter((e) => e.kind === 'competition').forEach((e) => {
      const k = compKey(e);
      if (!map.has(k)) map.set(k, { key: k, name: e.name, week_no: e.week_no, priority: e.priority, tentative: e.tentative, athletes: [] });
      map.get(k).athletes.push(a.display_name);
    });
  });
  const start = overview.season?.start_date;
  return [...map.values()].map((c) => {
    if (!start) return c;
    const [y, m, d] = start.split('-').map(Number);
    return { ...c, date: new Date(Date.UTC(y, m - 1, d + (c.week_no - 1) * 7)).toISOString().slice(0, 10) };
  }).sort((a, b) => a.week_no - b.week_no);
}

export default function TaperChecklists({ overview, nowWeek }) {
  const comps = useMemo(() => competitionsFrom(overview), [overview]);
  const upcoming = comps.filter((c) => !nowWeek || c.week_no >= nowWeek);
  const [selected, setSelected] = useState(upcoming[0]?.key || comps[0]?.key || null);
  const [items, setItems] = useState(null);
  const [checks, setChecks] = useState([]);
  const [error, setError] = useState('');
  const [showPast, setShowPast] = useState(false);
  const [newItem, setNewItem] = useState({ category: '', label: '' });
  const [editing, setEditing] = useState(false);

  const fail = (e) => setError(e.message || String(e));
  const loadItems = () => must(supabase.from('hp_taper_items').select('*').eq('active', true).order('sort')).then(setItems).catch(fail);
  const loadChecks = () => must(supabase.from('hp_taper_checks').select('*').limit(10000)).then(setChecks).catch(fail);
  useEffect(() => { loadItems(); loadChecks(); }, []);

  const doneFor = (key) => new Set(checks.filter((c) => c.comp_key === key && c.done).map((c) => c.item_id));
  const comp = comps.find((c) => c.key === selected);
  const done = comp ? doneFor(comp.key) : new Set();
  const categories = items ? [...new Set(items.map((i) => i.category))] : [];

  const toggle = (item) => {
    const isDone = done.has(item.id);
    setChecks((cs) => [...cs.filter((c) => !(c.comp_key === comp.key && c.item_id === item.id)),
      { comp_key: comp.key, item_id: item.id, done: !isDone }]);
    supabase.from('hp_taper_checks').upsert(
      { comp_key: comp.key, item_id: item.id, done: !isDone, updated_at: new Date().toISOString() },
      { onConflict: 'comp_key,item_id' },
    ).then(({ error: e }) => { if (e) { fail(e); loadChecks(); } });
  };
  const addItem = () => {
    const category = newItem.category.trim() || categories[categories.length - 1] || 'Other';
    const inCat = items.filter((i) => i.category === category).map((i) => i.sort);
    const sort = inCat.length ? Math.max(...inCat) + 1 : Math.max(0, ...items.map((i) => i.sort)) + 10;
    must(supabase.from('hp_taper_items').insert({ category, label: newItem.label.trim(), sort }))
      .then(() => { setNewItem({ ...newItem, label: '' }); loadItems(); }).catch(fail);
  };
  const removeItem = (item) => {
    must(supabase.from('hp_taper_items').update({ active: false }).eq('id', item.id)).then(loadItems).catch(fail);
  };

  if (error) return <div style={{ ...styles.card, padding: 16, color: '#9A2B2B' }}>Couldn't load checklists: {error}</div>;
  if (!items) return <div style={{ color: '#5B5F56' }}>Loading...</div>;
  if (!comps.length) return <div style={{ ...styles.card, padding: 16, color: '#5B5F56' }}>No competitions in the plans yet.</div>;

  const list = showPast ? comps : upcoming;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) 1fr', gap: 14, alignItems: 'start' }} className="taper-grid">
      <style>{'@media (max-width: 760px) { .taper-grid { grid-template-columns: 1fr !important; } }'}</style>
      <div style={{ ...styles.card, padding: 8 }}>
        {list.map((c) => {
          const n = doneFor(c.key).size;
          const pct = items.length ? Math.round((n / items.length) * 100) : 0;
          const on = c.key === selected;
          return (
            <button key={c.key} type="button" onClick={() => setSelected(c.key)} style={{
              all: 'unset', cursor: 'pointer', display: 'block', width: '100%', boxSizing: 'border-box', padding: '9px 10px',
              borderRadius: 8, background: on ? '#FDF0E6' : 'transparent', borderLeft: `3px solid ${on ? HP_ORANGE : 'transparent'}`,
            }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {c.name}{c.priority && <span style={{ fontSize: 11.5, color: '#8A8D84', fontWeight: 500 }}> · {c.priority}</span>}
              </div>
              <div style={{ fontSize: 12, color: '#5B5F56' }}>{c.date ? prettyDate(c.date) : `Week ${c.week_no}`}{c.tentative ? ' · tentative' : ''}</div>
              <div style={{ height: 4, background: '#EFEDE6', borderRadius: 2, marginTop: 6 }}>
                <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#2A5A30' : HP_ORANGE, borderRadius: 2 }} />
              </div>
              <div style={{ fontSize: 11.5, color: '#8A8D84', marginTop: 2 }}>{n}/{items.length}</div>
            </button>
          );
        })}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#5B5F56', padding: '8px 10px 4px' }}>
          <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} /> Show past competitions
        </label>
      </div>

      {comp && (
        <div style={{ ...styles.card, padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontSize: 17, fontWeight: 600 }}>{comp.name}</span>
            <span style={{ fontSize: 13, color: '#5B5F56' }}>{done.size} of {items.length} done</span>
            <button className="dp-btn" style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: 13 }} onClick={() => setEditing(!editing)}>
              {editing ? 'Done editing' : 'Edit list'}
            </button>
          </div>
          <div style={{ fontSize: 12.5, color: '#8A8D84', marginBottom: 10 }}>Athletes: {comp.athletes.join(', ')}</div>
          <div style={{ columnWidth: 300, columnGap: 24 }}>
            {categories.map((cat) => {
              const its = items.filter((i) => i.category === cat);
              const n = its.filter((i) => done.has(i.id)).length;
              return (
                <div key={cat} style={{ breakInside: 'avoid', marginBottom: 14 }}>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: n === its.length ? '#2A5A30' : '#8A8D84', marginBottom: 2 }}>
                    {cat} · {n}/{its.length}
                  </div>
                  {its.map((i) => (
                    <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 14 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, cursor: 'pointer',
                        color: done.has(i.id) ? '#8A8D84' : '#20241F', textDecoration: done.has(i.id) ? 'line-through' : 'none' }}>
                        <input type="checkbox" checked={done.has(i.id)} onChange={() => toggle(i)} style={{ width: 18, height: 18, accentColor: HP_ORANGE }} />
                        {i.label}
                      </label>
                      {editing && (
                        <button className="dp-btn" style={{ padding: 4, border: 'none' }} aria-label={`Remove ${i.label}`} onClick={() => removeItem(i)}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          {editing && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid #EFECE3', paddingTop: 12 }}>
              <select className="dp-select" value={newItem.category} onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}>
                <option value="">Section…</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <input className="dp-input" style={{ flex: '1 1 200px' }} placeholder="New item (added to every competition)"
                value={newItem.label} onChange={(e) => setNewItem({ ...newItem, label: e.target.value })} />
              <button className="dp-btn dp-btn-primary" disabled={!newItem.label.trim()} onClick={addItem}>Add</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
