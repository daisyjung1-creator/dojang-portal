import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, AlertTriangle, RotateCcw } from 'lucide-react';
import { loadPayHours, savePayDay, clearPayDay, fmtHours, parseHoursInput, EARLY_ALLOWANCE_MIN } from '../../lib/clockPayHours';
import { formatTime12h, formatClockTime } from './clockUtils.js';

const pad = (n) => String(n).padStart(2, '0');
const dayLabel = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });

// Staff Clock → Pay Hours: the hours each employee is actually paid for,
// month by month. These totals are what Payroll fills in.
export default function PayHoursTab({ employees }) {
  const [offset, setOffset] = useState(-1); // last month by default (payroll runs after the month)
  const base = new Date();
  const first = new Date(base.getFullYear(), base.getMonth() + offset, 1);
  const from = `${first.getFullYear()}-${pad(first.getMonth() + 1)}-01`;
  const to = `${first.getFullYear()}-${pad(first.getMonth() + 1)}-${pad(new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate())}`;
  const monthLabel = first.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });

  const [data, setData] = useState(null);
  const [openEmp, setOpenEmp] = useState(null);
  const [edit, setEdit] = useState(null); // { emp, date, value, note }
  const [err, setErr] = useState('');

  const load = async () => setData(await loadPayHours(from, to));
  useEffect(() => { setData(null); load(); }, [from]);

  const rows = useMemo(() => employees.map((e) => ({ emp: e, rec: data?.[e.id] || { days: [], total: 0 } })), [employees, data]);

  async function saveEdit() {
    const mins = parseHoursInput(edit.value);
    if (mins == null || mins > 1440) { setErr('Type hours like 2:30 or 2.5'); return; }
    const { error } = await savePayDay(edit.emp, edit.date, mins, edit.note.trim());
    if (error) { setErr(error.message); return; }
    setEdit(null); setErr('');
    load();
  }
  async function reset(empId, date) {
    await clearPayDay(empId, date);
    load();
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <button className="dp-btn" aria-label="Previous month" onClick={() => setOffset((o) => o - 1)}><ChevronLeft size={16} /></button>
        <div style={{ fontWeight: 600, fontSize: 16, minWidth: 150, textAlign: 'center' }}>{monthLabel}</div>
        <button className="dp-btn" aria-label="Next month" onClick={() => setOffset((o) => o + 1)}><ChevronRight size={16} /></button>
      </div>
      <p style={{ fontSize: 13, color: 'var(--dp-ink-soft)', margin: '0 0 14px' }}>
        Paid from clock-in (up to {EARLY_ALLOWANCE_MIN} min before the shift) to the scheduled end. Tap a day to change it. Payroll uses these totals.
      </p>

      {!data ? (
        <div style={{ color: 'var(--dp-ink-faint)', padding: 30, textAlign: 'center' }}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map(({ emp, rec }) => {
            const flagged = rec.days.filter((d) => d.flags.length && !d.override).length;
            const open = openEmp === emp.id;
            return (
              <div key={emp.id} style={{ background: 'var(--dp-paper)', border: '1px solid var(--dp-line)', borderRadius: 12 }}>
                <button onClick={() => setOpenEmp(open ? null : emp.id)} style={{ width: '100%', background: 'transparent', border: 'none', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{emp.name}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--dp-ink-soft)' }}>
                      {rec.days.filter((d) => d.minutes > 0).length} days
                      {flagged > 0 && <span style={{ color: 'var(--dp-warning)', marginLeft: 8 }}>· {flagged} to check</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 20, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtHours(rec.total)}</div>
                    <div style={{ fontSize: 12, color: 'var(--dp-ink-faint)' }}>{(rec.total / 60).toFixed(2)} h</div>
                  </div>
                </button>
                {open && (
                  <div style={{ borderTop: '1px solid var(--dp-line)', overflowX: 'auto' }}>
                    {rec.days.length === 0 ? (
                      <div style={{ padding: 16, fontSize: 13, color: 'var(--dp-ink-faint)' }}>No clock records or shifts this month.</div>
                    ) : (
                      <table className="dp-table" style={{ width: '100%' }}>
                        <thead>
                          <tr><th>Date</th><th>Shift</th><th>Clocked</th><th style={{ textAlign: 'right' }}>Clock time</th><th style={{ textAlign: 'right' }}>Paid</th><th></th></tr>
                        </thead>
                        <tbody>
                          {rec.days.map((d) => {
                            const raw = d.entries.reduce((t, e) => t + (e.clock_out ? Math.max(0, (new Date(e.clock_out) - new Date(e.clock_in)) / 60000) : 0), 0);
                            const editing = edit && edit.emp === emp.id && edit.date === d.date;
                            return (
                              <tr key={d.date}>
                                <td style={{ whiteSpace: 'nowrap' }}>{dayLabel(d.date)}</td>
                                <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>{d.shift ? `${formatTime12h(d.shift.start_time)}–${formatTime12h(d.shift.end_time)}` : '—'}</td>
                                <td style={{ fontSize: 13 }}>
                                  {d.entries.length ? d.entries.map((e) => (
                                    <div key={e.id} style={{ whiteSpace: 'nowrap' }}>{formatClockTime(new Date(e.clock_in))}–{e.clock_out ? formatClockTime(new Date(e.clock_out)) : '?'}</div>
                                  )) : '—'}
                                  {d.flags.length > 0 && !d.override && (
                                    <div style={{ color: 'var(--dp-warning)', fontSize: 12, display: 'flex', gap: 4, alignItems: 'center' }}><AlertTriangle size={12} />{d.flags.join(' · ')}</div>
                                  )}
                                  {d.override?.note && <div style={{ fontSize: 12, color: 'var(--dp-ink-soft)' }}>Note: {d.override.note}</div>}
                                </td>
                                <td style={{ textAlign: 'right', color: 'var(--dp-ink-faint)', fontVariantNumeric: 'tabular-nums' }}>{fmtHours(Math.round(raw))}</td>
                                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                  {editing ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                                      <input className="dp-input" autoFocus style={{ width: 80, textAlign: 'right' }} value={edit.value} placeholder="2:30" onChange={(ev) => setEdit({ ...edit, value: ev.target.value })} onKeyDown={(ev) => ev.key === 'Enter' && saveEdit()} />
                                      <input className="dp-input" style={{ width: 160 }} value={edit.note} placeholder="Reason (optional)" onChange={(ev) => setEdit({ ...edit, note: ev.target.value })} />
                                      <div style={{ display: 'flex', gap: 4 }}>
                                        <button className="dp-btn" onClick={() => { setEdit(null); setErr(''); }}>Cancel</button>
                                        <button className="dp-btn dp-btn-primary" onClick={saveEdit}>Save</button>
                                      </div>
                                      {err && <div style={{ color: 'var(--dp-danger)', fontSize: 12 }}>{err}</div>}
                                    </div>
                                  ) : (
                                    <button onClick={() => setEdit({ emp: emp.id, date: d.date, value: fmtHours(d.minutes), note: d.override?.note || '' })} style={{ background: 'transparent', border: '1px dashed var(--dp-line)', borderRadius: 6, padding: '4px 8px', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                      {fmtHours(d.minutes)}
                                    </button>
                                  )}
                                  {d.override && !editing && <div style={{ fontSize: 11.5, color: 'var(--dp-info)' }}>Changed (calc {fmtHours(d.calcMinutes)})</div>}
                                </td>
                                <td>
                                  {d.override && !editing && (
                                    <button className="dp-btn" title="Back to the calculated hours" aria-label="Reset" onClick={() => reset(emp.id, d.date)}><RotateCcw size={14} /></button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
