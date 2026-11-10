// Competitions for one HP athlete: results, matches, and what the YTP had them working on that week.
import React, { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import { styles } from '../../lib/uiStyles';
import {
  PLACEMENTS, ROUNDS, deleteCompetition, deleteMatch, loadCompetitions, record, saveCompetition, saveMatch,
} from './hpCompetitions';
import { CODE_LABELS } from './ytpData';
import { CODE_STYLE, HP_ORANGE } from './ytpTheme';

const MEDAL = { Gold: '#C9A227', Silver: '#9AA0A6', Bronze: '#B0703C' };
const label = { display: 'block', fontSize: 12.5, color: '#5B5F56', marginBottom: 4 };

function prettyDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
}

function weekOf(plan, iso) {
  return plan.weeks.find((w) => {
    const [y, m, d] = w.week_start.split('-').map(Number);
    const end = new Date(Date.UTC(y, m - 1, d + 6)).toISOString().slice(0, 10);
    return iso >= w.week_start && iso <= end;
  }) || null;
}

export default function CompetitionsPanel({ athlete, plan }) {
  const [comps, setComps] = useState(null);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);

  const reload = () => loadCompetitions(athlete.id).then(setComps).catch((e) => setError(e.message || String(e)));
  useEffect(() => { reload(); }, [athlete.id]);
  const saved = () => { setModal(null); reload(); };

  const rec = useMemo(() => (comps ? record(comps) : null), [comps]);
  // Competition events in the plan that don't have a record yet (to pick from).
  const planned = useMemo(() => {
    if (!comps) return [];
    return plan.events.filter((e) => e.kind === 'competition')
      .map((e) => ({ ...e, date: plan.weeks.find((w) => w.week_no === e.week_no)?.week_start }))
      .filter((e) => e.date && !comps.some((c) => c.name === e.name));
  }, [plan, comps]);

  if (error) return <div style={{ ...styles.card, padding: 16, color: '#9A2B2B' }}>Couldn't load competitions: {error}</div>;
  if (!comps) return <div style={{ color: '#5B5F56' }}>Loading...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ ...styles.card, padding: '14px 16px', display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
        <div><div style={{ fontSize: 12, color: '#8A8D84' }}>Matches</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{rec.wins}W – {rec.losses}L</div></div>
        <div><div style={{ fontSize: 12, color: '#8A8D84' }}>Medals</div>
          <div style={{ display: 'flex', gap: 10, fontSize: 15, fontWeight: 600 }}>
            {['Gold', 'Silver', 'Bronze'].map((p) => (
              <span key={p} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 12, height: 12, borderRadius: 6, background: MEDAL[p] }} />{rec.medals[p]}
              </span>
            ))}
          </div></div>
        <button className="dp-btn dp-btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setModal({ type: 'comp' })}>
          + Add competition
        </button>
      </div>

      {!comps.length && <div style={{ ...styles.card, padding: 16, color: '#5B5F56' }}>No competitions recorded yet.</div>}
      {comps.map((c) => (
        <CompetitionCard key={c.id} comp={c} plan={plan}
          onEdit={() => setModal({ type: 'comp', comp: c })}
          onAddMatch={() => setModal({ type: 'match', comp: c })}
          onEditMatch={(m) => setModal({ type: 'match', comp: c, match: m })} />
      ))}

      {modal?.type === 'comp' && (
        <CompetitionForm athlete={athlete} comp={modal.comp} planned={planned} onClose={() => setModal(null)} onSaved={saved} />
      )}
      {modal?.type === 'match' && (
        <MatchForm comp={modal.comp} match={modal.match} onClose={() => setModal(null)} onSaved={saved} />
      )}
    </div>
  );
}

function CompetitionCard({ comp, plan, onEdit, onAddMatch, onEditMatch }) {
  const week = weekOf(plan, comp.date);
  const focus = week
    ? plan.rows.filter((r) => (r.area === 'technical' || r.area === 'tactical') && r.cells[week.week_no])
    : [];
  const wins = comp.matches.filter((m) => m.result === 'W').length;
  const losses = comp.matches.filter((m) => m.result === 'L').length;
  return (
    <div style={{ ...styles.card, padding: '14px 16px', borderTop: `3px solid ${MEDAL[comp.placement] || HP_ORANGE}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>{comp.name}</span>
        <span style={{ fontSize: 13, color: '#5B5F56' }}>{prettyDate(comp.date)}{comp.division ? ` · ${comp.division}` : ''}</span>
        {comp.placement && (
          <span style={{ fontSize: 12.5, fontWeight: 600, borderRadius: 999, padding: '2px 9px',
            background: MEDAL[comp.placement] || '#EFEDE6', color: MEDAL[comp.placement] ? '#fff' : '#45483F' }}>
            {comp.placement}
          </span>
        )}
        <span style={{ fontSize: 13, color: '#45483F' }}>{wins}W – {losses}L</span>
        <button className="dp-btn" style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: 13 }} onClick={onEdit}>Edit</button>
      </div>
      {comp.notes && <p style={{ fontSize: 13, color: '#45483F', margin: '8px 0 0' }}>{comp.notes}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginTop: 10 }}>
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#8A8D84', marginBottom: 4 }}>Matches</div>
          {comp.matches.map((m) => (
            <button key={m.id} type="button" onClick={() => onEditMatch(m)} style={{
              all: 'unset', cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'baseline', width: '100%',
              padding: '6px 0', borderBottom: '1px solid #F1EEE6', fontSize: 13.5,
            }}>
              <b style={{ width: 18, color: m.result === 'W' ? '#2A5A30' : m.result === 'L' ? '#9A2B2B' : '#8A8D84' }}>{m.result || '–'}</b>
              <span style={{ width: 100, color: '#5B5F56' }}>{m.round || ''}</span>
              <span style={{ flex: 1 }}>
                {m.opponent || 'Opponent'}{m.opponent_club && <span style={{ color: '#8A8D84' }}> · {m.opponent_club}</span>}
                {m.notes && <span style={{ display: 'block', fontSize: 12.5, color: '#8A8D84' }}>{m.notes}</span>}
              </span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{m.score}</span>
            </button>
          ))}
          <button className="dp-btn" style={{ marginTop: 8, padding: '4px 10px', fontSize: 13 }} onClick={onAddMatch}>+ Add match</button>
        </div>
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#8A8D84', marginBottom: 4 }}>
            Plan that week{week ? ` · Week ${week.week_no}${week.phase ? ` · ${week.phase}` : ''}` : ''}
          </div>
          {!week && <div style={{ fontSize: 13, color: '#8A8D84' }}>Outside this season's plan.</div>}
          {week && !focus.length && <div style={{ fontSize: 13, color: '#8A8D84' }}>No technical or tactical skills planned.</div>}
          {focus.map((r) => {
            const code = r.cells[week.week_no];
            const s = CODE_STYLE[code];
            return (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, padding: '3px 0' }}>
                <span style={{ display: 'inline-flex', justifyContent: 'center', width: 24, borderRadius: 4, fontWeight: 700, fontSize: 11, background: s.bg, color: s.fg }}>{code}</span>
                {r.name} <span style={{ fontSize: 12, color: '#8A8D84' }}>{r.area} · {CODE_LABELS[code]}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CompetitionForm({ athlete, comp, planned, onClose, onSaved }) {
  const [f, setF] = useState(() => ({
    name: comp?.name || '', date: comp?.date || '', division: comp?.division || athlete.category || '',
    placement: comp?.placement || '', notes: comp?.notes || '',
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const run = (fn) => { setBusy(true); fn().then(onSaved).catch((e) => { setError(e.message || String(e)); setBusy(false); }); };
  const save = () => run(() => saveCompetition({
    athlete_id: athlete.id, name: f.name.trim(), date: f.date, division: f.division.trim() || null,
    placement: f.placement || null, notes: f.notes.trim() || null,
  }, comp?.id));
  return (
    <Modal title={comp ? 'Edit competition' : 'Add competition'} onClose={onClose}
      footer={<>
        {comp && <button className="dp-btn dp-btn-danger" style={{ marginRight: 'auto' }} disabled={busy} onClick={() => setConfirm(true)}>Delete</button>}
        <button className="dp-btn" onClick={onClose}>Cancel</button>
        <button className="dp-btn dp-btn-primary" disabled={busy || !f.name.trim() || !f.date} onClick={save}>Save</button>
      </>}>
      {!comp && planned.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <span style={label}>From the plan</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {planned.map((e) => (
              <button key={e.id} type="button" className="dp-btn" style={{ padding: '4px 10px', fontSize: 13 }}
                onClick={() => setF({ ...f, name: e.name, date: e.date })}>{e.name}</button>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label style={{ gridColumn: '1 / -1' }}><span style={label}>Name</span>
          <input className="dp-input" style={{ width: '100%' }} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label><span style={label}>Date</span>
          <input type="date" className="dp-input" style={{ width: '100%' }} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
        <label><span style={label}>Result</span>
          <select className="dp-select" style={{ width: '100%' }} value={f.placement} onChange={(e) => setF({ ...f, placement: e.target.value })}>
            <option value="">—</option>
            {PLACEMENTS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select></label>
        <label style={{ gridColumn: '1 / -1' }}><span style={label}>Division</span>
          <input className="dp-input" style={{ width: '100%' }} value={f.division} onChange={(e) => setF({ ...f, division: e.target.value })} /></label>
        <label style={{ gridColumn: '1 / -1' }}><span style={label}>Coach notes</span>
          <textarea className="dp-input" rows={3} style={{ width: '100%' }} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
      </div>
      {error && <div style={{ color: '#9A2B2B', fontSize: 13, marginTop: 8 }}>{error}</div>}
      {confirm && <ConfirmDialog message={`Delete "${comp.name}" and its matches?`} onCancel={() => setConfirm(false)}
        onConfirm={() => { setConfirm(false); run(() => deleteCompetition(comp.id)); }} />}
    </Modal>
  );
}

function MatchForm({ comp, match, onClose, onSaved }) {
  const [f, setF] = useState(() => ({
    round: match?.round || '', opponent: match?.opponent || '', opponent_club: match?.opponent_club || '',
    result: match?.result || '', score: match?.score || '', notes: match?.notes || '',
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = (fn) => { setBusy(true); fn().then(onSaved).catch((e) => { setError(e.message || String(e)); setBusy(false); }); };
  const clean = (v) => v.trim() || null;
  const save = () => run(() => saveMatch({
    competition_id: comp.id, sort: match?.sort ?? comp.matches.length + 1, round: clean(f.round), opponent: clean(f.opponent),
    opponent_club: clean(f.opponent_club), result: f.result || null, score: clean(f.score), notes: clean(f.notes),
  }, match?.id));
  return (
    <Modal title={`${match ? 'Edit' : 'Add'} match · ${comp.name}`} onClose={onClose}
      footer={<>
        {match && <button className="dp-btn dp-btn-danger" style={{ marginRight: 'auto' }} disabled={busy}
          onClick={() => run(() => deleteMatch(match.id))}><Trash2 size={14} /> Delete</button>}
        <button className="dp-btn" onClick={onClose}>Cancel</button>
        <button className="dp-btn dp-btn-primary" disabled={busy} onClick={save}>Save</button>
      </>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label><span style={label}>Round</span>
          <select className="dp-select" style={{ width: '100%' }} value={f.round} onChange={(e) => setF({ ...f, round: e.target.value })}>
            <option value="">—</option>
            {ROUNDS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select></label>
        <div><span style={label}>Result</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {[['W', 'Win', '#2A5A30', '#E8F1E9'], ['L', 'Loss', '#9A2B2B', '#FBEAEA']].map(([v, l, fg, bg]) => (
              <button key={v} type="button" className="dp-btn" onClick={() => setF({ ...f, result: f.result === v ? '' : v })}
                style={f.result === v ? { background: bg, color: fg, borderColor: fg, fontWeight: 600 } : undefined}>{l}</button>
            ))}
          </div></div>
        <label><span style={label}>Opponent</span>
          <input className="dp-input" style={{ width: '100%' }} value={f.opponent} onChange={(e) => setF({ ...f, opponent: e.target.value })} /></label>
        <label><span style={label}>Club / country</span>
          <input className="dp-input" style={{ width: '100%' }} value={f.opponent_club} onChange={(e) => setF({ ...f, opponent_club: e.target.value })} /></label>
        <label style={{ gridColumn: '1 / -1' }}><span style={label}>Score (rounds won, or each round, e.g. 2-1 or 8-5, 3-9, 12-4)</span>
          <input className="dp-input" style={{ width: '100%' }} value={f.score} onChange={(e) => setF({ ...f, score: e.target.value })} /></label>
        <label style={{ gridColumn: '1 / -1' }}><span style={label}>Notes (what worked, what didn't)</span>
          <textarea className="dp-input" rows={3} style={{ width: '100%' }} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
      </div>
      {error && <div style={{ color: '#9A2B2B', fontSize: 13, marginTop: 8 }}>{error}</div>}
    </Modal>
  );
}
