import { supabase } from '../supabaseClient';

// Paid hours from Staff Clock records (used by Staff Clock → Pay Hours and
// by Payroll). Rules, per clock-in on a day with a scheduled shift:
//   start = clock-in, but no earlier than 15 min before the shift starts
//           (late arrivals are paid from when they actually clocked in)
//   end   = clock-out, but no later than the scheduled end
// Days with clock records but no shift are paid as clocked and flagged.
// A day the admin changed by hand (staff_clock_pay_days) always wins.
export const EARLY_ALLOWANCE_MIN = 15;

const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const at = (date, hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  const d = new Date(`${date}T00:00:00`);
  d.setHours(h, m || 0, 0, 0);
  return d;
};

export const fmtHours = (mins) => `${Math.floor(mins / 60)}:${pad(Math.round(mins) % 60)}`;
// "2:30", "2.5" or "150m" → minutes (null if not understood)
export function parseHoursInput(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (/^\d+:\d{1,2}$/.test(s)) {
    const [h, m] = s.split(':').map(Number);
    return m < 60 ? h * 60 + m : null;
  }
  if (/^\d+m$/i.test(s)) return parseInt(s, 10);
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 60) : null;
}

// One day for one employee → { minutes, calcMinutes, flags[], override }
export function payDay({ date, entries, shift, override, now = new Date() }) {
  const flags = [];
  let calc = 0;
  let shiftStart = null;
  let shiftEnd = null;
  if (shift) {
    shiftStart = at(date, shift.start_time);
    shiftEnd = at(date, shift.end_time);
    if (shiftEnd <= shiftStart) {
      flags.push('Shift times look wrong');
      shiftStart = null;
      shiftEnd = null;
    }
  }
  const sorted = [...entries].sort((a, b) => new Date(a.clock_in) - new Date(b.clock_in));
  let lastEnd = null; // don't pay the same minutes twice
  for (const e of sorted) {
    let s = new Date(e.clock_in);
    let end = e.clock_out ? new Date(e.clock_out) : null;
    if (!end) {
      flags.push('No clock-out');
      if (shiftEnd) end = shiftEnd;
      else continue;
    }
    if (shiftStart) {
      const earliest = new Date(shiftStart.getTime() - EARLY_ALLOWANCE_MIN * 60000);
      if (s < earliest) s = earliest;
      if (end > shiftEnd) end = shiftEnd;
    }
    if (lastEnd && s < lastEnd) s = lastEnd;
    if (end > s) {
      calc += (end - s) / 60000;
      lastEnd = end;
    }
  }
  calc = Math.round(calc);
  if (entries.length && !shift) flags.push('No shift scheduled — paid as clocked');
  if (!entries.length && shift && at(date, shift.end_time) < now) flags.push('Scheduled but no clock-in');
  const minutes = override ? override.minutes : calc;
  return { date, minutes, calcMinutes: calc, flags, override: override || null, shift: shift || null, entries: sorted };
}

// Everything for a date range: { [employeeId]: { days: [...], total } }
export async function loadPayHours(from, to) {
  const [{ data: entries }, { data: shifts }, { data: overrides }] = await Promise.all([
    supabase.from('staff_clock_entries').select('*').gte('date', from).lte('date', to),
    supabase.from('staff_clock_shifts').select('*').gte('date', from).lte('date', to),
    supabase.from('staff_clock_pay_days').select('*').gte('date', from).lte('date', to),
  ]);
  const key = (emp, d) => `${emp}|${d}`;
  const byDay = {};
  const touch = (emp, d) => (byDay[key(emp, d)] ||= { emp, date: d, entries: [], shift: null, override: null });
  (entries || []).forEach((e) => touch(e.employee_id, e.date).entries.push(e));
  (shifts || []).forEach((s) => { touch(s.employee_id, s.date).shift = s; });
  (overrides || []).forEach((o) => { touch(o.employee_id, o.date).override = o; });
  const out = {};
  Object.values(byDay).forEach((d) => {
    const day = payDay(d);
    const rec = (out[d.emp] ||= { days: [], total: 0 });
    rec.days.push(day);
    rec.total += day.minutes;
  });
  Object.values(out).forEach((r) => r.days.sort((a, b) => a.date.localeCompare(b.date)));
  return out;
}

export async function savePayDay(employeeId, date, minutes, note) {
  return supabase.from('staff_clock_pay_days').upsert(
    { employee_id: employeeId, date, minutes, note: note || null, updated_at: new Date().toISOString() },
    { onConflict: 'employee_id,date' },
  );
}
export async function clearPayDay(employeeId, date) {
  return supabase.from('staff_clock_pay_days').delete().eq('employee_id', employeeId).eq('date', date);
}
