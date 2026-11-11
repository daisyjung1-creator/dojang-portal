// "Manage tests": add, edit, reorder, hide/show fitness test items.
// No delete — deleting an item would also delete its results. Hiding keeps every result.
import React, { useEffect, useState } from 'react';
import { ChevronLeft, Eye, EyeOff, Pencil } from 'lucide-react';
import Modal from '../../components/Modal';
import { styles } from '../../lib/uiStyles';
import { addItem, loadAllItems, makeKey, swapItems, updateItem } from './fitTests';
import { HP_ORANGE } from './ytpTheme';

const label = { display: 'block', fontSize: 12.5, color: '#5B5F56', marginBottom: 4 };
const BETTER = [['higher', 'Higher is better'], ['lower', 'Lower is better'], ['', 'No direction (e.g. growth)']];

export default function ManageTests({ onBack }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const fail = (e) => { setError(e.message || String(e)); setBusy(false); };
  const reload = () => loadAllItems().then((i) => { setItems(i); setBusy(false); }).catch(fail);
  useEffect(() => { reload(); }, []);
  const run = (fn) => { setBusy(true); fn().then(reload).catch(fail); };

  if (error) return <div style={{ ...styles.card, padding: 16, color: '#9A2B2B' }}>Couldn't load tests: {error}</div>;
  if (!items) return <div style={{ color: '#5B5F56' }}>Loading...</div>;

  const categories = [...new Set(items.map((i) => i.category))];
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <button className="dp-btn" onClick={onBack}><ChevronLeft size={16} /> Back to results</button>
        <span style={{ fontSize: 16, fontWeight: 600 }}>Manage tests</span>
        <button className="dp-btn dp-btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setModal({ item: null })}>+ Add test</button>
      </div>
      <p style={{ fontSize: 12.5, color: '#8A8D84', margin: '0 0 12px' }}>
        Hidden tests disappear from entry and athlete views, but their results are kept — show them again any time.
        If the way a test is measured changes, hide the old one and add a new test so results stay comparable
        (NCCP <em>Developing Athletic Abilities</em> 4.8: tests must be standardized to compare results).
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {categories.map((cat) => {
          const its = items.filter((i) => i.category === cat);
          return (
            <div key={cat} style={{ ...styles.card, padding: '10px 14px' }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#8A8D84', marginBottom: 4 }}>{cat}</div>
              {its.map((it, idx) => (
                <div key={it.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #F1EEE6',
                  opacity: it.active ? 1 : 0.5, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <button className="dp-btn" aria-label={`Move ${it.name} up`} disabled={busy || idx === 0}
                      style={{ padding: '0 6px', border: 'none', fontSize: 11 }} onClick={() => run(() => swapItems(it, its[idx - 1]))}>▲</button>
                    <button className="dp-btn" aria-label={`Move ${it.name} down`} disabled={busy || idx === its.length - 1}
                      style={{ padding: '0 6px', border: 'none', fontSize: 11 }} onClick={() => run(() => swapItems(it, its[idx + 1]))}>▼</button>
                  </div>
                  <div style={{ flex: '1 1 220px' }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>
                      {it.name}{!it.active && <span style={{ fontSize: 12, color: '#8A8D84', fontWeight: 400 }}> · hidden</span>}
                    </div>
                    <div style={{ fontSize: 12, color: '#8A8D84' }}>
                      {[it.unit, it.sides ? 'Left / Right' : null,
                        it.better === 'higher' ? 'higher is better' : it.better === 'lower' ? 'lower is better' : 'no direction',
                        `${it.resultCount} result${it.resultCount === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <button className="dp-btn" style={{ padding: '4px 10px', fontSize: 13 }} disabled={busy} onClick={() => setModal({ item: it })}>
                    <Pencil size={13} /> Edit
                  </button>
                  <button className="dp-btn" style={{ padding: '4px 10px', fontSize: 13 }} disabled={busy}
                    onClick={() => run(() => updateItem(it.key, { active: !it.active }))}>
                    {it.active ? <><EyeOff size={13} /> Hide</> : <><Eye size={13} /> Show</>}
                  </button>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      {modal && (
        <ItemForm item={modal.item} items={items} categories={categories}
          onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />
      )}
    </>
  );
}

function ItemForm({ item, items, categories, onClose, onSaved }) {
  const [f, setF] = useState(() => ({
    name: item?.name || '', category: item?.category || categories[0] || '', newCategory: '',
    unit: item?.unit || '', sides: item?.sides || false, better: item?.better || 'higher', notes: item?.notes || '',
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const category = f.category === '__new' ? f.newCategory.trim() : f.category;
  const name = f.name.trim();
  const dup = items.some((i) => i.key !== item?.key && i.name.toLowerCase() === name.toLowerCase());
  const hasResults = item && item.resultCount > 0;
  const measureChanged = hasResults && (
    (f.unit.trim() || null) !== (item.unit || null) || f.sides !== item.sides || (f.better || null) !== (item.better || null));

  const save = () => {
    const fields = {
      name, category, unit: f.unit.trim() || null, sides: f.sides, better: f.better || null, notes: f.notes.trim() || null,
    };
    setBusy(true);
    const p = item
      ? updateItem(item.key, fields)
      : addItem({
        ...fields, key: makeKey(name, items.map((i) => i.key)), active: true,
        sort: (() => {
          const inCat = items.filter((i) => i.category === category).map((i) => i.sort);
          return inCat.length ? Math.max(...inCat) + 1 : Math.max(0, ...items.map((i) => i.sort)) + 100;
        })(),
      });
    p.then(onSaved).catch((e) => { setError(e.message || String(e)); setBusy(false); });
  };

  return (
    <Modal title={item ? `Edit · ${item.name}` : 'Add test'} onClose={onClose}
      footer={<>
        <button className="dp-btn" onClick={onClose}>Cancel</button>
        <button className="dp-btn dp-btn-primary" disabled={busy || !name || !category || dup} onClick={save}>Save</button>
      </>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label style={{ gridColumn: '1 / -1' }}><span style={label}>Name</span>
          <input className="dp-input" style={{ width: '100%' }} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label><span style={label}>Section</span>
          <select className="dp-select" style={{ width: '100%' }} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            <option value="__new">New section…</option>
          </select></label>
        {f.category === '__new' ? (
          <label><span style={label}>New section name</span>
            <input className="dp-input" style={{ width: '100%' }} value={f.newCategory} onChange={(e) => setF({ ...f, newCategory: e.target.value })} /></label>
        ) : (
          <label><span style={label}>Unit</span>
            <input className="dp-input" style={{ width: '100%' }} placeholder="cm, sec, laps…" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} /></label>
        )}
        {f.category === '__new' && (
          <label><span style={label}>Unit</span>
            <input className="dp-input" style={{ width: '100%' }} placeholder="cm, sec, laps…" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} /></label>
        )}
        <label><span style={label}>Which result is better?</span>
          <select className="dp-select" style={{ width: '100%' }} value={f.better} onChange={(e) => setF({ ...f, better: e.target.value })}>
            {BETTER.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select></label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, gridColumn: '1 / -1' }}>
          <input type="checkbox" checked={f.sides} onChange={(e) => setF({ ...f, sides: e.target.checked })} />
          Measured on the left and right sides separately
        </label>
        <label style={{ gridColumn: '1 / -1' }}><span style={label}>How to test (shown as a tip on the entry table)</span>
          <input className="dp-input" style={{ width: '100%' }} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
      </div>
      {dup && <div style={{ color: '#9A2B2B', fontSize: 13, marginTop: 8 }}>A test with this name already exists.</div>}
      {measureChanged && (
        <div style={{ background: '#FFF6DB', color: '#7A5A00', fontSize: 13, borderRadius: 6, padding: '8px 10px', marginTop: 10 }}>
          This test already has {item.resultCount} results. Changing the unit, left/right or direction changes how those results
          are read and compared. If the way you measure has changed, cancel, hide this test, and add a new one instead.
          {f.sides !== item.sides && ' Left/right results and single results won\'t line up with each other.'}
        </div>
      )}
      {error && <div style={{ color: '#9A2B2B', fontSize: 13, marginTop: 8 }}>{error}</div>}
      <p style={{ fontSize: 12, color: '#8A8D84', margin: '10px 0 0' }}>
        <span style={{ color: HP_ORANGE }}>●</span> Renaming keeps all past results.
      </p>
    </Modal>
  );
}
