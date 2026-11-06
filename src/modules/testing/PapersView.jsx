import React, { useEffect, useMemo, useState } from 'react';
import { Printer, Plus, Trash2, BookOpen, Copy } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import Modal from '../../components/Modal';
import { planFor, byBeltThenName, LEADER_ROLES, DEFAULT_LEADER_NOTES, stripeNo, blackStripePoomsae } from '../../lib/testSheets';
import { printScoringSheet, printBoardSheet, printLeaders } from './sheetsPrint';

// Test-day paper: judges' scoring sheet, board-break spots, Leaders Club roles.
export default function PapersView({ rows, test, tests, onPatchEntry, onPatchTest, say }) {
  const [curriculum, setCurriculum] = useState([]);
  const [editCur, setEditCur] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    supabase.from('belt_curriculum').select('*').order('sort').then(({ data }) => setCurriculum(data || []));
  }, []);
  const curByBelt = useMemo(() => Object.fromEntries(curriculum.map((c) => [c.belt, c])), [curriculum]);
  const sorted = useMemo(() => [...rows].sort(byBeltThenName), [rows]);
  const blacks = sorted.filter((r) => stripeNo(r.e.current_belt) != null);
  const planRows = showAll ? sorted : blacks;
  const fail = (ok) => ok || say('Allow pop-ups to print.', true);

  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <button className="dp-btn dp-btn-primary" disabled={!rows.length || !curriculum.length} onClick={() => fail(printScoringSheet(rows, curByBelt, test))}><Printer size={15} /> Print scoring sheet</button>
        <button className="dp-btn" disabled={!curriculum.length} onClick={() => fail(printBoardSheet(rows, curriculum, curByBelt, test))}><Printer size={15} /> Print board break spots</button>
        <button className="dp-btn" onClick={() => fail(printLeaders(test.leaders, test))}><Printer size={15} /> Print Leaders roles</button>
        <button className="dp-btn" style={{ marginLeft: 'auto' }} onClick={() => setEditCur(true)}><BookOpen size={15} /> Test content by belt</button>
      </div>

      {/* Per-student: black stripes choose their own break */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>{showAll ? 'Each student' : 'Black stripes'}</h3>
        <span style={{ fontSize: 12.5, color: '#5B5F56' }}>Poomsae is filled in from their stripe; type each one’s board break.</span>
        <label style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5B5F56', display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show everyone (to change one student’s content)
        </label>
      </div>
      <div style={{ ...styles.card, marginBottom: 22 }}>
        {planRows.length === 0 ? (
          <p style={{ padding: 16, margin: 0, fontSize: 13.5, color: '#5B5F56' }}>No black stripes on this test.</p>
        ) : (
          <table className="dp-table">
            <thead>
              <tr>
                <th>Student</th>
                <th style={{ width: 110 }}>Poomsae</th>
                <th>Board break (English)</th>
                <th>격파 (한글)</th>
                <th style={{ width: 150 }}>Material</th>
              </tr>
            </thead>
            <tbody>
              {planRows.map(({ e, s }) => (
                <PlanRow key={e.id} e={e} s={s} plan={planFor(e, curByBelt)} onSave={(patch) => onPatchEntry(e, { plan: { ...(e.plan || {}), ...patch } })} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Leaders test={test} tests={tests} onSave={(leaders) => onPatchTest({ leaders })} />

      {editCur && <CurriculumModal curriculum={curriculum} onClose={() => setEditCur(false)} onSaved={(row) => setCurriculum((list) => list.map((c) => (c.belt === row.belt ? row : c)))} />}
    </>
  );
}

function PlanRow({ e, s, plan, onSave }) {
  const [v, setV] = useState({ poomsae: plan.poomsae, break_en: plan.break_en, break_ko: plan.break_ko, material: plan.material });
  const blur = (k) => {
    if ((v[k] || '') === (plan[k] || '')) return;
    // Blank = back to the automatic value.
    onSave({ [k]: v[k] });
  };
  const inp = (k, ph) => (
    <textarea
      className="dp-input"
      rows={1}
      style={{ width: '100%', fontSize: 13, padding: '5px 7px', resize: 'vertical' }}
      placeholder={ph}
      value={v[k] || ''}
      onChange={(ev) => setV({ ...v, [k]: ev.target.value })}
      onBlur={() => blur(k)}
    />
  );
  const autoPoomsae = plan.black ? blackStripePoomsae(e.current_belt, e.target_belt) : '';
  return (
    <tr>
      <td style={{ whiteSpace: 'nowrap' }}>
        <div style={{ fontWeight: 500 }}>{s.name}</div>
        <div style={{ fontSize: 12, color: '#8A8D84' }}>{e.current_belt} → {e.target_belt}</div>
      </td>
      <td>{inp('poomsae', autoPoomsae || '—')}</td>
      <td>{inp('break_en', plan.black ? 'e.g. Tornado + reverse kick' : '')}</td>
      <td>{inp('break_ko', '')}</td>
      <td>{inp('material', '')}</td>
    </tr>
  );
}

function Leaders({ test, tests, onSave }) {
  const init = test.leaders || { rows: [], notes: DEFAULT_LEADER_NOTES };
  const [rows, setRows] = useState(init.rows?.length ? init.rows : [{ name: '', poomsae: '', sparring: '', board: '' }]);
  const [notes, setNotes] = useState(init.notes ?? DEFAULT_LEADER_NOTES);
  const save = (r = rows, n = notes) => onSave({ rows: r.filter((x) => x.name || x.poomsae || x.sparring || x.board), notes: n });
  const set = (i, k, val) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: val } : r)));
  const previous = tests.filter((t) => t.id !== test.id && t.leaders?.rows?.length).sort((a, b) => (a.test_date < b.test_date ? 1 : -1))[0];

  const cell = (i, k) => (
    <input className="dp-input" list="leader-roles" style={{ width: '100%', fontSize: 13, padding: '5px 7px' }} value={rows[i][k] || ''} onChange={(ev) => set(i, k, ev.target.value)} onBlur={() => save()} />
  );

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Leaders Club roles</h3>
        <span style={{ fontSize: 12.5, color: '#5B5F56' }}>For this test only — pick a role from the list or type your own. Saves as you go.</span>
        {previous && !test.leaders?.rows?.length && (
          <button className="dp-btn" style={{ marginLeft: 'auto', padding: '3px 10px', fontSize: 12.5 }} onClick={() => { setRows(previous.leaders.rows); setNotes(previous.leaders.notes ?? notes); save(previous.leaders.rows, previous.leaders.notes ?? notes); }}>
            <Copy size={13} /> Start from the last test’s list
          </button>
        )}
      </div>
      <datalist id="leader-roles">{LEADER_ROLES.map((r) => <option key={r} value={r} />)}</datalist>
      <div style={styles.card}>
        <table className="dp-table">
          <thead>
            <tr><th style={{ width: 170 }}>Assistant</th><th>Poomsae</th><th>Sparring</th><th>Board Break</th><th style={{ width: 40 }}></th></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{cell(i, 'name')}</td>
                <td>{cell(i, 'poomsae')}</td>
                <td>{cell(i, 'sparring')}</td>
                <td>{cell(i, 'board')}</td>
                <td>
                  <button className="dp-btn" style={{ padding: 5 }} aria-label="Remove assistant" onClick={() => { const next = rows.filter((_, j) => j !== i); setRows(next.length ? next : [{ name: '', poomsae: '', sparring: '', board: '' }]); save(next); }}><Trash2 size={13} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ padding: '8px 12px', borderTop: '1px solid #F1EFE7' }}>
          <button className="dp-btn" onClick={() => setRows([...rows, { name: '', poomsae: '', sparring: '', board: '' }])}><Plus size={14} /> Add assistant</button>
        </div>
      </div>
      <label style={{ display: 'block', fontSize: 12.5, color: '#5B5F56', margin: '12px 0 4px' }}>Notes printed under the roles</label>
      <textarea className="dp-input" style={{ width: '100%', minHeight: 110, fontSize: 13 }} value={notes} onChange={(ev) => setNotes(ev.target.value)} onBlur={() => save()} />
    </>
  );
}

function CurriculumModal({ curriculum, onClose, onSaved }) {
  const [belt, setBelt] = useState(curriculum.find((c) => c.belt !== 'Black Stripe')?.belt || '');
  const row = curriculum.find((c) => c.belt === belt);
  const [form, setForm] = useState(row || {});
  const [msg, setMsg] = useState('');
  useEffect(() => setForm(curriculum.find((c) => c.belt === belt) || {}), [belt]);
  async function save() {
    const patch = { poomsae: form.poomsae, basic_ko: form.basic_ko, basic_en: form.basic_en, kicking: form.kicking, break_ko: form.break_ko, break_en: form.break_en, spot: form.spot, material: form.material, updated_at: new Date().toISOString() };
    const { data, error } = await supabase.from('belt_curriculum').update(patch).eq('belt', belt).select().single();
    if (error) return setMsg('Could not save: ' + error.message);
    onSaved(data);
    setMsg(`${belt} saved.`);
  }
  const f = (k, label, rows = 3) => (
    <label style={{ display: 'block', marginBottom: 10 }}>
      <span style={{ display: 'block', fontSize: 12.5, color: '#5B5F56', marginBottom: 3 }}>{label}</span>
      <textarea className="dp-input" rows={rows} style={{ width: '100%', fontSize: 13 }} value={form[k] || ''} onChange={(ev) => setForm({ ...form, [k]: ev.target.value })} />
    </label>
  );
  return (
    <Modal
      title="Test content by belt"
      maxWidth={720}
      onClose={onClose}
      footer={
        <>
          {msg && <span style={{ marginRight: 'auto', fontSize: 12.5, color: '#2A5A30' }}>{msg}</span>}
          <button className="dp-btn" onClick={onClose}>Close</button>
          <button className="dp-btn dp-btn-primary" onClick={save}>Save {belt}</button>
        </>
      }
    >
      <p style={{ fontSize: 12.5, color: '#5B5F56', marginTop: 0 }}>By the belt the student holds now. One item per line. Black stripes get their poomsae from their stripe and their own break.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
        {curriculum.filter((c) => c.belt !== 'Black Stripe').map((c) => (
          <button key={c.belt} className="dp-btn" onClick={() => { setBelt(c.belt); setMsg(''); }} style={{ padding: '3px 10px', fontSize: 12.5, background: c.belt === belt ? '#20241F' : '#fff', color: c.belt === belt ? '#fff' : '#20241F' }}>{c.belt}</button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
        {f('poomsae', 'Poomsae (Taegeuk)', 1)}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {f('spot', 'Break spot (#1 / #2)', 1)}
          {f('material', 'Material', 1)}
        </div>
        {f('basic_ko', '기본동작 (한글)', 5)}
        {f('basic_en', 'Basic movements (English)', 5)}
        {f('break_ko', '격파 (한글)', 2)}
        {f('break_en', 'Board break (English)', 2)}
        <div style={{ gridColumn: '1 / -1' }}>{f('kicking', 'Kicking (발차기)', 2)}</div>
      </div>
    </Modal>
  );
}
