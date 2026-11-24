import React, { useEffect, useMemo, useState } from 'react';
import { Award, Pencil, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { addDaysISO, daysUntil } from '../../lib/billingDates';
import { MIN_CLASSES, countStart, classesSince, beltIndex } from '../../lib/beltTesting';
import { inClass, DOJANG_CLASSES } from '../../lib/classes';
import { fetchAll } from '../invoices/api';
import Modal from '../../components/Modal';
import Field from '../../components/Field';
import { Card, Tag, Empty, GREEN, AMBER, RED, GREY, smallBtn, linkBtn, touchLinkBtn } from './homeUi';
import BeltStrip from '../../components/BeltStrip';

// Home: where everyone stands for the next belt test — time left, where the
// curriculum should be by now, and who won't reach the class minimum.

export const DEFAULT_PACING = [
  { label: 'Basics & new belt material', weeks: 3, detail: 'Basic movements and kicks for the next belt' },
  { label: 'Poomsae', weeks: 3, detail: 'Learn the new poomsae start to finish' },
  { label: 'Kicking & sparring drills', weeks: 2, detail: 'Kicking counts and step sparring' },
  { label: 'Breaking', weeks: 2, detail: 'Breaking techniques for the test' },
  { label: 'Review & mock test', weeks: 2, detail: 'Run the whole test, fix weak spots' },
];

const shortDay = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
const firstLines = (t, n = 2) => String(t || '').split('\n').filter(Boolean).slice(0, n).join(' / ');

// Which part of the belt curriculum a pacing phase is about.
function phaseItem(label, cur) {
  if (!cur) return '';
  const l = String(label).toLowerCase();
  if (/poomsae|form|품새/.test(l)) return cur.poomsae ? `Poomsae ${cur.poomsae}` : '';
  if (/basic|기본/.test(l)) return firstLines(cur.basic_en);
  if (/kick|spar|발차기|겨루기/.test(l)) return firstLines(String(cur.kicking || '').split('\n').filter((x) => /[A-Za-z]/.test(x)).join('\n'));
  if (/break|격파/.test(l)) return firstLines(cur.break_en);
  return '';
}

// touch: staff iPad (Today) — DESIGN.md touch sizes. Admin Home keeps the compact look.
export default function BeltProgressCard({ students, schedule, settings, today, setActiveTab, onSaved, readOnly = false, touch = false }) {
  const T = touch;
  const link = T ? touchLinkBtn : linkBtn;
  const [tests, setTests] = useState(null);
  const [curriculum, setCurriculum] = useState([]);
  const [att, setAtt] = useState([]);
  const [showAll, setShowAll] = useState(false);
  const [perClass, setPerClass] = useState(false);
  const [edit, setEdit] = useState(null);

  const pacing = settings?.test_pacing?.length ? settings.test_pacing : DEFAULT_PACING;
  const cycleWeeks = Number(settings?.test_cycle_weeks) || 12;
  const roster = useMemo(() => students.filter((s) => !s.billing_exempt), [students]);

  useEffect(() => {
    const yearAgo = addDaysISO(today, -365);
    const from = roster.map(countStart).sort()[0] || yearAgo;
    Promise.all([
      supabase.from('belt_tests').select('id, test_date, title').order('test_date'),
      supabase.from('belt_curriculum').select('*').order('sort'),
      fetchAll(() => supabase.from('attendance').select('student_id, date, status').gte('date', from < yearAgo ? yearAgo : from)),
    ]).then(([{ data: t }, { data: c }, { data: a }]) => {
      setTests(t || []);
      setCurriculum(c || []);
      setAtt(a || []);
    });
  }, [roster.length]);

  const info = useMemo(() => {
    if (!tests) return null;
    const prev = tests.filter((t) => t.test_date < today).pop() || null;
    const next = tests.find((t) => t.test_date >= today) || null;
    const start = prev ? prev.test_date : addDaysISO(today, -7 * 2);
    const end = next ? next.test_date : addDaysISO(start, cycleWeeks * 7);
    const total = Math.max(daysBetween(start, end), 1);
    const done = Math.min(Math.max(daysBetween(start, today), 0), total);
    // Pacing phases scaled to the real cycle.
    const w = pacing.reduce((n, p) => n + (Number(p.weeks) || 0), 0) || 1;
    let acc = 0;
    let prevTo = start;
    const phases = pacing.map((p, i) => {
      const from = i === 0 ? start : addDaysISO(prevTo, 1);
      acc += Number(p.weeks) || 0;
      const to = addDaysISO(start, Math.round((acc / w) * total));
      prevTo = to;
      return { ...p, from, to };
    });
    const cur = Math.max(0, phases.findIndex((p) => today <= p.to));
    const daysLeft = daysUntil(end);
    // Students
    const by = {};
    att.forEach((r) => (by[r.student_id] ||= []).push(r));
    const weeksLeft = Math.max(daysLeft, 0) / 7;
    const list = roster.map((s) => {
      const n = classesSince(s, by[s.id] || []);
      const per = Number(s.classes_per_week) || (inClass(s, 'Comp Team') ? 4 : 2);
      const projected = n + Math.floor(per * weeksLeft);
      const need = Math.max(MIN_CLASSES - n, 0);
      const status = n >= MIN_CLASSES ? 'ready' : projected >= MIN_CLASSES ? 'track' : 'behind';
      return { s, n, per, projected, need, status, perWeekNeeded: weeksLeft > 0 ? need / weeksLeft : Infinity };
    });
    return { prev, next, start, end, total, done, phases, cur: done >= total ? phases.length - 1 : cur, daysLeft, list, weekNo: Math.floor(done / 7) + 1, weeks: Math.ceil(total / 7) };
  }, [tests, att, roster, pacing, cycleWeeks, today]);

  const curByBelt = useMemo(() => Object.fromEntries(curriculum.map((c) => [c.belt, c])), [curriculum]);

  async function savePacing() {
    const list = edit.list.filter((p) => p.label.trim() && Number(p.weeks) > 0).map((p) => ({ label: p.label.trim(), weeks: Number(p.weeks), detail: (p.detail || '').trim() }));
    const { data, error } = await supabase.from('invoice_settings').update({ test_pacing: list, test_cycle_weeks: Number(edit.cycle) || 12 }).eq('id', 1).select().single();
    if (error) return setEdit({ ...edit, error: error.message });
    onSaved && onSaved(data);
    setEdit(null);
  }

  const action = readOnly ? null : (
    <div style={{ display: 'flex', gap: 6 }}>
      <button className="dp-btn" style={smallBtn} onClick={() => setEdit({ list: pacing.map((p) => ({ ...p })), cycle: cycleWeeks, error: '' })}><Pencil size={11} /> Pacing</button>
      <button className="dp-btn" style={smallBtn} onClick={() => setActiveTab('testing')}>Testing</button>
    </div>
  );

  if (!info) return <Card touch={T} title="Belt test progress" icon={Award} action={action}><Empty touch={T}>Loading…</Empty></Card>;

  const { phases, cur, list } = info;
  const counts = { ready: 0, track: 0, behind: 0 };
  list.forEach((x) => counts[x.status]++);
  const behind = list.filter((x) => x.status === 'behind').sort((a, b) => b.perWeekNeeded - a.perWeekNeeded || a.n - b.n);
  const pct = Math.round((info.done / info.total) * 100);
  const now = phases[cur];
  const after = phases[cur + 1];

  // Classes on the schedule, in the usual order, with their students' belts.
  const classNames = [...new Set(schedule.map((c) => c.class_name))].sort((a, b) => {
    const ia = DOJANG_CLASSES.indexOf(a), ib = DOJANG_CLASSES.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  return (
    <>
      <Card touch={T} title="Belt test progress" icon={Award} action={action}>
        <div style={{ padding: T ? '14px 16px' : '12px 14px' }}>
          {/* Countdown */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            {info.next ? (
              <>
                <span style={{ fontSize: T ? 'var(--dp-text-display)' : 22, fontWeight: T ? 700 : 600, color: info.daysLeft <= 14 ? 'var(--dp-warning)' : 'var(--dp-ink)', fontVariantNumeric: 'tabular-nums' }}>{info.daysLeft === 0 ? 'Today' : `${info.daysLeft} day${info.daysLeft === 1 ? '' : 's'}`}</span>
                <span style={{ fontSize: T ? 'var(--dp-text-body)' : 13, color: 'var(--dp-ink-soft)' }}>to {info.next.title || 'belt testing'} · {shortDay(info.next.test_date)}</span>
              </>
            ) : (
              <>
                <span style={{ fontSize: T ? 'var(--dp-text-title)' : 15, fontWeight: 600 }}>Next test not scheduled</span>
                <span style={{ fontSize: T ? 'var(--dp-text-body)' : 13, color: 'var(--dp-ink-soft)' }}>
                  — pacing assumes about {shortDay(info.end)} ({cycleWeeks} weeks after {info.prev ? shortDay(info.prev.test_date) : 'now'}).{' '}
                  {!readOnly && <button style={link} onClick={() => setActiveTab('testing')}>Set the date</button>}
                </span>
              </>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: T ? 'var(--dp-text-label)' : 12, color: T ? 'var(--dp-ink-soft)' : 'var(--dp-ink-faint)', margin: '8px 0 4px' }}>
            <span>Week {Math.min(info.weekNo, info.weeks)} of {info.weeks}</span>
            <span>{pct}% of the way</span>
          </div>

          {/* Pacing bar */}
          <div style={{ display: 'flex', gap: 2, height: T ? 32 : 22, borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
            {phases.map((p, i) => (
              <div
                key={i}
                title={`${p.label}: ${shortDay(p.from)} – ${shortDay(p.to)}`}
                style={{ flex: Number(p.weeks) || 1, background: i < cur ? 'var(--dp-success-tint)' : i === cur ? 'var(--dp-success)' : 'var(--dp-canvas)', color: i === cur ? '#fff' : i < cur ? 'var(--dp-success)' : 'var(--dp-ink-faint)', fontSize: T ? 'var(--dp-text-caption)' : 10.5, fontWeight: T && i === cur ? 600 : 400, display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: '0 4px' }}
              >
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</span>
              </div>
            ))}
            <div style={{ position: 'absolute', top: -2, bottom: -2, left: `calc(${pct}% - 1px)`, width: 2, background: 'var(--dp-ink)' }} />
          </div>
          <div style={{ fontSize: T ? 'var(--dp-text-body)' : 13, marginTop: T ? 14 : 10, lineHeight: 1.5 }}>
            <div>
              <b style={T ? { fontSize: 'var(--dp-text-title)' } : undefined}>Classes should be on: {now.label}</b> <span style={{ color: 'var(--dp-ink-faint)' }}>(until {shortDay(now.to)})</span>
            </div>
            {now.detail && <div style={{ color: 'var(--dp-ink-soft)' }}>{now.detail}</div>}
            {after && <div style={{ color: T ? 'var(--dp-ink-soft)' : 'var(--dp-ink-faint)', fontSize: T ? 'var(--dp-text-label)' : 12.5 }}>Next: {after.label} from {shortDay(after.from)}</div>}
            <button style={{ ...link, marginTop: 4 }} onClick={() => setPerClass(!perClass)} aria-expanded={perClass}>{perClass ? 'Hide' : 'Show'} what each class works on now</button>
          </div>
          {perClass && (
            <table className="dp-table" style={{ marginTop: 6 }}>
              <tbody>
                {classNames.map((cn) => {
                  const kids = roster.filter((s) => inClass(s, cn));
                  if (!kids.length) return null;
                  const belts = {};
                  kids.forEach((s) => (belts[s.belt || 'White'] = (belts[s.belt || 'White'] || 0) + 1));
                  const rows = Object.entries(belts).sort((a, b) => beltIndex(a[0]) - beltIndex(b[0]));
                  return (
                    <tr key={cn}>
                      <td style={{ fontWeight: T ? 600 : 500, verticalAlign: 'top', width: 140, fontSize: T ? 'var(--dp-text-body)' : 13 }}>{cn}<div style={{ fontSize: T ? 'var(--dp-text-label)' : 11.5, color: T ? 'var(--dp-ink-soft)' : 'var(--dp-ink-faint)', fontWeight: 400 }}>{kids.length} student{kids.length === 1 ? "" : "s"}</div></td>
                      <td style={{ fontSize: T ? 'var(--dp-text-body)' : 12.5 }}>
                        {rows.map(([b, n]) => {
                          const item = phaseItem(now.label, curByBelt[b]);
                          return (
                            <div key={b} style={T ? { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '2px 0' } : undefined}>
                              {T && <BeltStrip belt={b} width={44} />}
                              <span style={{ color: 'var(--dp-ink-soft)' }}>{b} ×{n}</span>
                              {item && <span> — {item}</span>}
                            </div>
                          );
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Students vs the class minimum */}
        <div style={{ borderTop: `1px solid ${T ? 'var(--dp-line)' : 'var(--dp-canvas)'}`, padding: T ? '14px 16px' : '10px 14px 12px' }}>
          <div style={{ fontSize: T ? 'var(--dp-text-body)' : 13, marginBottom: T ? 10 : 6, lineHeight: T ? 2 : undefined }}>
            <b>{MIN_CLASSES} classes</b> needed since their last test
            <Tag touch={T} c={GREEN}>{counts.ready} ready</Tag>
            <Tag touch={T} c={GREY}>{counts.track} on track</Tag>
            <Tag touch={T} c={counts.behind ? RED : GREY}>{counts.behind} behind</Tag>
          </div>
          {behind.length === 0 ? (
            <div style={{ fontSize: T ? 'var(--dp-text-body)' : 12.5, color: 'var(--dp-success)' }}>Everyone can reach {MIN_CLASSES} classes by the test at their usual pace.</div>
          ) : (
            <>
              <table className="dp-table">
                <tbody>
                  {(showAll ? behind : behind.slice(0, 6)).map((x) => (
                    <tr key={x.s.id}>
                      {T ? (
                        <td>
                          <div style={{ fontSize: 'var(--dp-text-title)', fontWeight: 600 }}>{x.s.name}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}><BeltStrip belt={x.s.belt} width={44} /><span style={{ fontSize: 'var(--dp-text-label)', color: 'var(--dp-ink-soft)' }}>{x.s.belt || 'White'}</span></div>
                        </td>
                      ) : (
                        <td style={{ fontSize: 13 }}>{x.s.name}<span style={{ fontSize: 12.5, color: 'var(--dp-ink-faint)' }}> · {x.s.belt || 'White'}</span></td>
                      )}
                      <td style={{ fontSize: T ? 'var(--dp-text-body)' : 12.5, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                        <b>{x.n}</b>/{MIN_CLASSES}
                        <div style={{ height: T ? 6 : 4, width: T ? 80 : 70, background: 'var(--dp-canvas)', borderRadius: 3, marginTop: 4 }}>
                          <div style={{ height: T ? 6 : 4, width: `${Math.min((x.n / MIN_CLASSES) * 100, 100)}%`, background: 'var(--dp-danger)', borderRadius: 2 }} />
                        </div>
                      </td>
                      <td style={{ fontSize: T ? 'var(--dp-text-label)' : 12, color: 'var(--dp-warning)' }}>
                        needs {x.need} more{Number.isFinite(x.perWeekNeeded) ? ` · ${Math.ceil(x.perWeekNeeded * 10) / 10}/week (usually ${x.per})` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {behind.length > 6 && (
                <button style={{ ...link, marginTop: 6 }} onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show all ${behind.length}`}</button>
              )}
              <div style={{ fontSize: T ? 'var(--dp-text-label)' : 11.5, color: T ? 'var(--dp-ink-soft)' : 'var(--dp-ink-faint)', marginTop: 6, lineHeight: 1.45 }}>Behind = at their usual classes per week they won't reach {MIN_CLASSES} by the test. Makeup or extra classes help.</div>
            </>
          )}
        </div>
      </Card>

      {edit && (
        <Modal
          title="Curriculum pacing for a test cycle"
          maxWidth={600}
          onClose={() => setEdit(null)}
          footer={
            <>
              <button className="dp-btn" onClick={() => setEdit(null)}>Cancel</button>
              <button className="dp-btn dp-btn-primary" onClick={savePacing}>Save</button>
            </>
          }
        >
          <p style={{ fontSize: 12.5, color: 'var(--dp-ink-soft)', margin: '0 0 10px' }}>
            In teaching order. The weeks are stretched or squeezed to fit the real time between two tests. Labels with “Basics”, “Poomsae”, “Kicking” or “Breaking” also show each belt's item from the testing sheets.
          </p>
          {edit.list.map((p, i) => {
            const upd = (patch) => setEdit({ ...edit, list: edit.list.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
            return (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                <span style={{ width: 18, fontSize: 12, color: 'var(--dp-ink-faint)' }}>{i + 1}.</span>
                <input className="dp-input" style={{ flex: '1 1 160px' }} placeholder="Phase" value={p.label} onChange={(e) => upd({ label: e.target.value })} />
                <input type="number" min="1" className="dp-input" style={{ width: 64 }} value={p.weeks} onChange={(e) => upd({ weeks: e.target.value })} />
                <span style={{ fontSize: 12, color: 'var(--dp-ink-faint)' }}>wks</span>
                <input className="dp-input" style={{ flex: '2 1 200px' }} placeholder="What to cover" value={p.detail || ''} onChange={(e) => upd({ detail: e.target.value })} />
                <button className="dp-btn dp-btn-danger" style={{ padding: 5 }} aria-label="Remove" onClick={() => setEdit({ ...edit, list: edit.list.filter((_x, j) => j !== i) })}><Trash2 size={12} /></button>
              </div>
            );
          })}
          <button className="dp-btn" style={{ marginTop: 4 }} onClick={() => setEdit({ ...edit, list: [...edit.list, { label: '', weeks: 1, detail: '' }] })}><Plus size={13} /> Add a phase</button>
          <div style={{ marginTop: 14 }}>
            <Field label="When no next test is set, assume it's this many weeks after the last one">
              <input type="number" min="4" className="dp-input" style={{ width: 80 }} value={edit.cycle} onChange={(e) => setEdit({ ...edit, cycle: e.target.value })} />
            </Field>
          </div>
          {edit.error && <p style={{ color: 'var(--dp-danger)', fontSize: 13 }}>{edit.error}</p>}
        </Modal>
      )}
    </>
  );
}
