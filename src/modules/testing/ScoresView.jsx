import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Printer, Check } from 'lucide-react';
import { styles } from '../../lib/uiStyles';
import { SECTIONS, MENTAL, SCORE_GUIDE, RANK_COLOR, summarize, mentalRank, DEFAULT_EXAMINER } from '../../lib/testScoring';

// Phones (and small tablets): the student list becomes a picker bar that stays at the top.
function useNarrow() {
  const q = '(max-width: 820px)';
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setNarrow(m.matches);
    m.addEventListener ? m.addEventListener('change', on) : m.addListener(on);
    return () => (m.removeEventListener ? m.removeEventListener('change', on) : m.removeListener(on));
  }, []);
  return narrow;
}

// Mark each student's Promotion Test Report (0–3 per criterion), with the
// section ranks worked out as you go. Every tap saves.
export default function ScoresView({ rows, test, onPatch, onPrint, onExaminer }) {
  const [sel, setSel] = useState(rows[0]?.e.id || null);
  const narrow = useNarrow();
  const [examiner, setExaminer] = useState(test.examiner || DEFAULT_EXAMINER);
  useEffect(() => setExaminer(test.examiner || DEFAULT_EXAMINER), [test.id]);
  useEffect(() => {
    if (!rows.some((r) => r.e.id === sel)) setSel(rows[0]?.e.id || null);
  }, [rows]);

  const idx = rows.findIndex((r) => r.e.id === sel);
  const cur = rows[idx];
  const go = (d) => {
    if (!rows[idx + d]) return;
    setSel(rows[idx + d].e.id);
    if (narrow) document.getElementById('dp-score-sheet')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (!rows.length) return <div style={{ ...styles.card, padding: 20, fontSize: 14, color: 'var(--dp-ink-soft)' }}>Add students to the test first.</div>;

  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <button className="dp-btn dp-btn-primary" onClick={() => onPrint(rows)}><Printer size={15} /> Print all reports ({rows.length})</button>
        {cur && <button className="dp-btn" onClick={() => onPrint([cur])}><Printer size={15} /> Print {cur.s.name.split(' ')[0]}’s report</button>}
        <span style={{ fontSize: 12.5, color: 'var(--dp-ink-soft)', marginLeft: 8 }}>Signed by</span>
        <input className="dp-input" style={{ width: 230, padding: '5px 8px', fontSize: 13 }} value={examiner} onChange={(e) => setExaminer(e.target.value)} onBlur={() => examiner !== (test.examiner || DEFAULT_EXAMINER) && onExaminer(examiner.trim() || null)} />
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--dp-ink-faint)' }}>In the print window choose “Save as PDF” to get the PDF.</span>
      </div>

      {narrow ? (
        <>
          <div style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', gap: 6, alignItems: 'center', background: '#F4F3EF', padding: '8px 0', flexWrap: 'nowrap' }}>
            <button className="dp-btn" style={{ padding: '10px 11px', flex: 'none' }} disabled={idx <= 0} aria-label="Previous student" onClick={() => go(-1)}><ChevronLeft size={18} /></button>
            <select className="dp-select" style={{ flex: 1, minWidth: 0, fontSize: 16, padding: '10px 8px' }} value={sel || ''} onChange={(ev) => setSel(ev.target.value)}>
              {rows.map(({ e, s }, i) => {
                const sum = summarize(e.scores, e.current_belt);
                return <option key={e.id} value={e.id}>{`${i + 1}. ${s.name}${sum.complete ? ' ✓' : sum.any ? ' …' : ''}`}</option>;
              })}
            </select>
            <span style={{ fontSize: 12.5, color: 'var(--dp-ink-soft)', flex: 'none' }}>{idx + 1}/{rows.length}</span>
            <button className="dp-btn" style={{ padding: '10px 11px', flex: 'none' }} disabled={idx >= rows.length - 1} aria-label="Next student" onClick={() => go(1)}><ChevronRight size={18} /></button>
          </div>
          <div id="dp-score-sheet" style={{ scrollMarginTop: 64 }} />
          {cur && <Sheet key={cur.e.id} narrow row={cur} onPatch={onPatch} onPrev={null} onNext={idx < rows.length - 1 ? () => go(1) : null} />}
        </>
      ) : (
      <div className="dp-stack" style={{ display: 'grid', gridTemplateColumns: '250px minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
        {/* Student list */}
        <div style={{ ...styles.card, maxHeight: '75vh', overflowY: 'auto' }}>
          {rows.map(({ e, s }) => {
            const sum = summarize(e.scores, e.current_belt);
            const on = e.id === sel;
            return (
              <button
                key={e.id}
                onClick={() => setSel(e.id)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', borderBottom: '1px solid var(--dp-canvas)', background: on ? 'var(--dp-ink)' : 'transparent', color: on ? '#fff' : 'var(--dp-ink)', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 500, flex: 1 }}>{s.name}</span>
                  {sum.complete ? <Check size={14} color={on ? 'var(--dp-success-tint)' : 'var(--dp-success)'} /> : sum.any ? <span style={{ fontSize: 12, color: on ? 'var(--dp-line)' : 'var(--dp-warning)' }}>…</span> : null}
                </div>
                <div style={{ fontSize: 12.5, color: on ? 'var(--dp-line)' : 'var(--dp-ink-faint)' }}>{e.current_belt} → {e.target_belt}</div>
              </button>
            );
          })}
        </div>

        {/* Sheet */}
        {cur && <Sheet key={cur.e.id} row={cur} onPatch={onPatch} onPrev={idx > 0 ? () => go(-1) : null} onNext={idx < rows.length - 1 ? () => go(1) : null} />}
      </div>
      )}
    </>
  );
}

function Sheet({ row: { e, s }, onPatch, onPrev, onNext, narrow }) {
  const [scores, setScores] = useState(e.scores || {});
  const sum = summarize(scores, e.current_belt);
  const save = (next) => {
    setScores(next);
    onPatch(e, { scores: next });
  };
  const mark = (key, n, i, v) => {
    const arr = Array.from({ length: n }, (_, k) => (scores[key] || [])[k] ?? null);
    arr[i] = arr[i] === v ? null : v; // tap again to clear
    save({ ...scores, [key]: arr });
  };
  const [notes, setNotes] = useState(scores.comments || {});
  const saveNote = (key) => {
    if ((scores.comments || {})[key] === notes[key]) return;
    save({ ...scores, comments: { ...(scores.comments || {}), [key]: notes[key] } });
  };

  const Marks = ({ k, n, i }) => (
    <div style={{ display: 'flex', gap: narrow ? 6 : 4, flex: 'none', flexWrap: 'nowrap', width: narrow ? '100%' : undefined }}>
      {[0, 1, 2, 3].map((v) => {
        const on = (scores[k] || [])[i] === v;
        return (
          <button
            key={v}
            type="button"
            title={SCORE_GUIDE[v].title}
            onClick={() => mark(k, n, i, v)}
            style={{ width: narrow ? undefined : 34, flex: narrow ? 1 : undefined, height: narrow ? 42 : 30, borderRadius: 6, border: `1px solid ${on ? 'var(--dp-ink)' : 'var(--dp-line)'}`, background: on ? 'var(--dp-ink)' : '#fff', color: on ? '#fff' : 'var(--dp-ink-soft)', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {v}
          </button>
        );
      })}
    </div>
  );

  const Rank = ({ r }) => (r ? <span style={{ fontWeight: 700, color: RANK_COLOR[r] || 'var(--dp-ink-soft)', fontSize: 13 }}>{r}</span> : <span style={{ color: 'var(--dp-line)', fontSize: 12 }}>—</span>);

  return (
    <div style={styles.card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid #EDEAE0' }}>
        {!narrow && <button className="dp-btn" style={{ padding: 5 }} disabled={!onPrev} aria-label="Previous student" onClick={onPrev}><ChevronLeft size={16} /></button>}
        <div style={{ flex: 1, minWidth: narrow ? '100%' : 0 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{s.name}</div>
          <div style={{ fontSize: 12.5, color: 'var(--dp-ink-soft)' }}>{e.current_belt} → {e.target_belt}</div>
        </div>
        <div style={{ display: 'flex', gap: 10, fontSize: 12 }}>
          {sum.sections.map((x) => (
            <span key={x.key} style={{ textAlign: 'center' }}>
              <div style={{ color: 'var(--dp-ink-faint)', fontSize: 12.5 }}>{x.label.split(' ')[0]}</div>
              <Rank r={x.rank} />
            </span>
          ))}
        </div>
        {!narrow && <button className="dp-btn" style={{ padding: 5 }} disabled={!onNext} aria-label="Next student" onClick={onNext}><ChevronRight size={16} /></button>}
      </div>

      <div style={{ padding: narrow ? '10px 10px 14px' : '10px 16px 16px' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--dp-ink-faint)', marginBottom: 8 }}>
          {SCORE_GUIDE.map((g) => <span key={g.n}><b style={{ color: 'var(--dp-ink)' }}>{g.n}</b> {g.title}</span>)}
          <span>· tap again to clear</span>
        </div>

        {sum.sections.map((sec) => (
          <div key={sec.key} style={{ border: '1px solid #EDEAE0', borderRadius: 8, marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '7px 12px', background: 'var(--dp-canvas)', borderBottom: '1px solid #EDEAE0', borderRadius: '8px 8px 0 0' }}>
              <span style={{ fontWeight: 600, fontSize: 13.5, flex: 1 }}>{sec.label}</span>
              <span style={{ fontSize: 12.5, color: 'var(--dp-ink-soft)', marginRight: 10 }}>Total {sec.marks.some((m) => m != null) ? sec.total : '–'} / {sec.max}</span>
              <Rank r={sec.rank} />
            </div>
            <div className="dp-stack" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(200px, 0.8fr)', gap: 12, padding: '8px 12px' }}>
              <div>
                {sec.criteria.map((c, i) => (
                  <div key={c} style={{ display: 'flex', flexWrap: narrow ? 'wrap' : 'nowrap', alignItems: 'center', gap: narrow ? 4 : 10, padding: narrow ? '6px 0' : '3px 0' }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: narrow ? 14 : 13 }}>{c}</span>
                    <Marks k={sec.key} n={sec.criteria.length} i={i} />
                  </div>
                ))}
              </div>
              <textarea
                className="dp-input"
                style={{ width: '100%', minHeight: 60, fontSize: 12.5, resize: 'vertical' }}
                placeholder="Comments"
                value={notes[sec.key] || ''}
                onChange={(ev) => setNotes({ ...notes, [sec.key]: ev.target.value })}
                onBlur={() => saveNote(sec.key)}
              />
            </div>
          </div>
        ))}

        <div style={{ border: '1px solid #EDEAE0', borderRadius: 8 }}>
          <div style={{ padding: '7px 12px', background: 'var(--dp-canvas)', borderBottom: '1px solid #EDEAE0', borderRadius: '8px 8px 0 0', fontWeight: 600, fontSize: 13.5 }}>
            {MENTAL.label} <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--dp-ink-faint)' }}>· 0 = NI, 1–2 = MS, 3 = ES</span>
          </div>
          <div className="dp-stack" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(200px, 0.8fr)', gap: 12, padding: '8px 12px' }}>
            <div>
              {MENTAL.criteria.map((c, i) => (
                <div key={c} style={{ display: 'flex', flexWrap: narrow ? 'wrap' : 'nowrap', alignItems: 'center', gap: narrow ? 4 : 10, padding: narrow ? '6px 0' : '3px 0' }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: narrow ? 14 : 13 }}>
                    {c}
                    {narrow && <span style={{ marginLeft: 8 }}><Rank r={mentalRank((scores.mental || [])[i])} /></span>}
                    {i === 2 && <div style={{ fontSize: 12, color: 'var(--dp-ink-faint)' }}>{MENTAL.note}</div>}
                  </span>
                  <Marks k={MENTAL.key} n={MENTAL.criteria.length} i={i} />
                  {!narrow && <span style={{ width: 26, textAlign: 'right' }}><Rank r={mentalRank((scores.mental || [])[i])} /></span>}
                </div>
              ))}
            </div>
            <textarea
              className="dp-input"
              style={{ width: '100%', minHeight: 60, fontSize: 12.5, resize: 'vertical' }}
              placeholder="Comments (attitude, taekwondo values)"
              value={notes.mental || ''}
              onChange={(ev) => setNotes({ ...notes, mental: ev.target.value })}
              onBlur={() => saveNote('mental')}
            />
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>Instructor’s comments &amp; next goals <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--dp-ink-faint)' }}>· printed at the bottom of the report (left blank = lines to write on)</span></span>
          <textarea
            className="dp-input"
            style={{ width: '100%', minHeight: 56, fontSize: 12.5, resize: 'vertical' }}
            value={notes.overall || ''}
            onChange={(ev) => setNotes({ ...notes, overall: ev.target.value })}
            onBlur={() => saveNote('overall')}
          />
        </div>
        {onNext && (
          <div style={{ textAlign: 'right', marginTop: 12 }}>
            <button className="dp-btn" onClick={onNext}>Next student <ChevronRight size={14} /></button>
          </div>
        )}
      </div>
    </div>
  );
}
