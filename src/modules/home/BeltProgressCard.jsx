import React, { useEffect, useMemo, useState } from 'react';
import { Award, Pencil, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { addDaysISO, daysUntil } from '../../lib/billingDates';
import { MIN_CLASSES, countStart, classesSince, beltIndex } from '../../lib/beltTesting';
import { inClass, DOJANG_CLASSES } from '../../lib/classes';
import { fetchAll } from '../invoices/api';
import Modal from '../../components/Modal';
import Field from '../../components/Field';
import { Card, Tag, Empty, GREEN, AMBER, RED, GREY, smallBtn, linkBtn } from './homeUi';

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

export default function BeltProgressCard({ students, schedule, settings, today, setActiveTab, onSaved }) {
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

  const action = (
    <div style={{ display: 'flex', gap: 6 }}>
      <button className="dp-btn" style={smallBtn} onClick={() => setEdit({ list: pacing.map((p) => ({ ...p })), cycle: cycleWeeks, error: '' })}><Pencil size={11} /> Pacing</button>
      <button className="dp-btn" style={smallBtn} onClick={() => setActiveTab('testing')}>Testing</button>
    </div>
  );

  if (!info) return <Card title="Belt test progress" icon={Award} action={action}><Empty>Loading…</Empty></Card>;

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
      <Card title="Belt test progress" icon={Award} action={action}>
        <div style={{ padding: '12px 14px' }}>
          {/* Countdown */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            {info.next ? (
              <>
                <span style={{ fontSize: 22, fontWeight: 600, color: info.daysLeft <= 14 ? '#854F0B' : '#20241F' }}>{info.daysLeft === 0 ? 'Today' : `${info.daysLeft} day${info.daysLeft === 1 ? '' : 's'}`}</span>
                <span style={{ fontSize: 13, color: '#5B5F56' }}>to {info.next.title || 'belt testing'} · {shortDay(info.next.test_date)}</span>
              </>
            ) : (
              <>
                <span style={{ fontSize: 15, fontWeight: 600 }}>Next test not scheduled</span>
                <span style={{ fontSize: 13, color: '#5B5F56' }}>
                  — pacing assumes about {shortDay(info.end)} ({cycleWeeks} weeks after {info.prev ? shortDay(info.prev.test_date) : 'now'}).{' '}
                  <button style={linkBtn} onClick={() => setActiveTab('testing')}>Set the date</button>
                </span>
              </>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#8A8D84', margin: '8px 0 4px' }}>
            <span>Week {Math.min(info.weekNo, info.weeks)} of {info.weeks}</span>
            <span>{pct}% of the way</span>
          </div>

          {/* Pacing bar */}
          <div style={{ display: 'flex', gap: 2, height: 22, borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
            {phases.map((p, i) => (
              <div
                key={i}
                title={`${p.label}: ${shortDay(p.from)} – ${shortDay(p.to)}`}
                style={{ flex: Number(p.weeks) || 1, background: i < cur ? '#BFDCC3' : i === cur ? '#2A5A30' : '#F1EFE7', color: i === cur ? '#fff' : i < cur ? '#2A5A30' : '#8A8D84', fontSize: 10.5, display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap', overflow: 'hidden', padding: '0 4px' }}
              >
                {p.label}
              </div>
            ))}
            <div style={{ position: 'absolute', top: -2, bottom: -2, left: `calc(${pct}% - 1px)`, width: 2, background: '#20241F' }} />
          </div>
          <div style={{ fontSize: 13, marginTop: 10, lineHeight: 1.5 }}>
            <div>
              <b>Classes should be on: {now.label}</b> <span style={{ color: '#8A8D84' }}>(until {shortDay(now.to)})</span>
            </div>
            {now.detail && <div style={{ color: '#5B5F56' }}>{now.detail}</div>}
            {after && <div style={{ color: '#8A8D84', fontSize: 12.5 }}>Next: {after.label} from {shortDay(after.from)}</div>}
            <button style={{ ...linkBtn, marginTop: 4 }} onClick={() => setPerClass(!perClass)}>{perClass ? 'Hide' : 'Show'} what each class works on now</button>
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
                      <td style={{ fontWeight: 500, verticalAlign: 'top', width: 140, fontSize: 13 }}>{cn}<div style={{ fontSize: 11.5, color: '#8A8D84', fontWeight: 400 }}>{kids.length} student{kids.length === 1 ? "" : "s"}</div></td>
                      <td style={{ fontSize: 12.5 }}>
                        {rows.map(([b, n]) => {
                          const item = phaseItem(now.label, curByBelt[b]);
                          return (
                            <div key={b}>
                              <span style={{ color: '#5B5F56' }}>{b} ×{n}</span>
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
        <div style={{ borderTop: '1px solid #F1EFE7', padding: '10px 14px 12px' }}>
          <div style={{ fontSize: 13, marginBottom: 6 }}>
            <b>{MIN_CLASSES} classes</b> needed since their last test
            <Tag c={GREEN}>{counts.ready} ready</Tag>
            <Tag c={GREY}>{counts.track} on track</Tag>
            <Tag c={counts.behind ? RED : GREY}>{counts.behind} behind</Tag>
          </div>
          {behind.length === 0 ? (
            <div style={{ fontSize: 12.5, color: '#2A5A30' }}>Everyone can reach {MIN_CLASSES} classes by the test at their usual pace.</div>
          ) : (
            <>
              <table className="dp-table">
                <tbody>
                  {(showAll ? behind : behind.slice(0, 6)).map((x) => (
                    <tr key={x.s.id}>
                      <td style={{ fontSize: 13 }}>{x.s.name}<span style={{ fontSize: 11.5, color: '#8A8D84' }}> · {x.s.belt || 'White'}</span></td>
                      <td style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
                        <b>{x.n}</b>/{MIN_CLASSES}
                        <div style={{ height: 4, width: 70, background: '#F1EFE7', borderRadius: 2, marginTop: 3 }}>
                          <div style={{ height: 4, width: `${Math.min((x.n / MIN_CLASSES) * 100, 100)}%`, background: '#9A2B2B', borderRadius: 2 }} />
                        </div>
                      </td>
                      <td style={{ fontSize: 12, color: '#854F0B' }}>
                        needs {x.need} more{Number.isFinite(x.perWeekNeeded) ? ` · ${Math.ceil(x.perWeekNeeded * 10) / 10}/week (usually ${x.per})` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {behind.length > 6 && (
                <button style={{ ...linkBtn, marginTop: 6 }} onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show all ${behind.length}`}</button>
              )}
              <div style={{ fontSize: 11.5, color: '#8A8D84', marginTop: 6 }}>Behind = at their usual classes per week they won't reach {MIN_CLASSES} by the test. Makeup or extra classes help.</div>
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
          <p style={{ fontSize: 12.5, color: '#5B5F56', margin: '0 0 10px' }}>
            In teaching order. The weeks are stretched or squeezed to fit the real time between two tests. Labels with “Basics”, “Poomsae”, “Kicking” or “Breaking” also show each belt's item from the testing sheets.
          </p>
          {edit.list.map((p, i) => {
            const upd = (patch) => setEdit({ ...edit, list: edit.list.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
            return (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                <span style={{ width: 18, fontSize: 12, color: '#8A8D84' }}>{i + 1}.</span>
                <input className="dp-input" style={{ flex: '1 1 160px' }} placeholder="Phase" value={p.label} onChange={(e) => upd({ label: e.target.value })} />
                <input type="number" min="1" className="dp-input" style={{ width: 64 }} value={p.weeks} onChange={(e) => upd({ weeks: e.target.value })} />
                <span style={{ fontSize: 12, color: '#8A8D84' }}>wks</span>
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
          {edit.error && <p style={{ color: '#9A2B2B', fontSize: 13 }}>{edit.error}</p>}
        </Modal>
      )}
    </>
  );
}
