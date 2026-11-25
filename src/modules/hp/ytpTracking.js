// Weekly tracking logic — pure functions (no database, no React), tested in scripts/ytp/test_tracking.mjs.

// Minimum sessions per week, from NCCP Developing Athletic Abilities:
//   Aerobic stamina 5.10 (develop 3–5, maintain 1–2) · Flexibility 5.8.1 (develop 2–4, maintain 1–2)
//   Speed 5.11 (develop 2–3, maintain 1) · Strength endurance 5.13 (develop and maintain 2–4)
export const DOC_MIN = {
  'Aerobic Stamina': { D: 3, M: 1, ref: '5.10' },
  Flexibility: { D: 2, M: 1, ref: '5.8.1' },
  Speed: { D: 2, M: 1, ref: '5.11' },
  'Strength Endurance': { D: 2, M: 2, ref: '5.13' },
};

// How many classes one attendance record counts as (same as the Attendance page).
export const STATUS_SESSIONS = { present: 1, double: 2, private: 1 };

const DAY = 24 * 60 * 60 * 1000;

export function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + n * DAY);
  return t.toISOString().slice(0, 10);
}

function weekday(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
}

function minutesBetween(start, end) {
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  return Math.max(0, toMin(end) - toMin(start));
}

/** Length of one class on that day, from class_schedule (falls back to 60 minutes). */
export function classMinutes(schedule, className, iso) {
  const wd = weekday(iso);
  const hit = schedule.find((s) => s.class_name === className && s.weekday === wd)
    || schedule.find((s) => s.class_name === className);
  return hit ? minutesBetween(hit.start_time, hit.end_time) : 60;
}

/**
 * One athlete's real training in one week.
 * attendance: records for that athlete in the week; sessions: individual sessions in the week.
 * Returns { hours, byClass: {name: count}, abilityCounts: {ability: n}, individual }.
 */
export function weekActuals({ attendance, sessions, schedule, classMap, physicalAbilities }) {
  const byClass = {};
  const abilityCounts = Object.fromEntries(physicalAbilities.map((a) => [a, 0]));
  let minutes = 0;
  const credit = (abilities, n) => {
    const list = abilities.includes('*') ? physicalAbilities : abilities;
    list.forEach((a) => { if (a in abilityCounts) abilityCounts[a] += n; });
  };
  attendance.forEach((r) => {
    const n = STATUS_SESSIONS[r.status] || 0;
    if (!n) return;
    const name = r.status === 'private' ? 'Private' : r.class_name;
    byClass[name] = (byClass[name] || 0) + n;
    minutes += r.status === 'private' ? Number(r.minutes) || 30 : classMinutes(schedule, r.class_name, r.date) * n;
    credit(classMap[r.class_name] || [], n);
  });
  sessions.forEach((s) => {
    byClass.Individual = (byClass.Individual || 0) + 1;
    minutes += Number(s.minutes) || 0;
    credit(s.abilities || [], 1);
  });
  return { hours: Math.round((minutes / 60) * 10) / 10, byClass, abilityCounts, individual: sessions.length };
}

/** 'ok' | 'low' | 'none' | null (not planned / no doc minimum). */
export function physicalStatus(name, code, count) {
  const min = DOC_MIN[name]?.[code];
  if (!min) return null;
  if (count >= min) return 'ok';
  return count > 0 ? 'low' : 'none';
}

// ── Changing a row's plan ─────────────────────────────────────────────
// A "block" is the run of consecutive filled weeks that contains `week`
// (it stops at a blank week, e.g. Christmas break or a transition).

function blockEnd(cells, week, lastWeek) {
  let end = week;
  while (end + 1 <= lastWeek && cells[end + 1]) end += 1;
  return end;
}

/**
 * Stay one more week on this week's stage: the rest of the block moves one week later.
 * Returns { cells, changed: [weeks], overflow } — overflow = the block now runs into the
 * next block (or past the season) and its last code was dropped.
 */
export function extendStage(cells, week, lastWeek = 52) {
  const code = cells[week];
  if (!code || week >= lastWeek) return null;
  const end = blockEnd(cells, week, lastWeek);
  const out = { ...cells };
  for (let w = end; w > week; w -= 1) {
    if (w + 1 <= lastWeek) out[w + 1] = cells[w];
  }
  out[week + 1] = code;
  // The block's last week was pushed past the season, or onto the first week of the next block.
  const overflow = end + 1 > lastWeek || Boolean(cells[end + 1]);
  return { cells: out, changed: diffWeeks(cells, out), overflow, newEnd: Math.min(end + 1, lastWeek) };
}

/**
 * Ready early: the next stage starts next week. The rest of the block moves earlier and the
 * freed weeks at the end keep the block's last stage, so the block still ends on the same week.
 */
export function advanceStage(cells, week, lastWeek = 52) {
  const code = cells[week];
  if (!code) return null;
  const end = blockEnd(cells, week, lastWeek);
  let next = week + 1;
  while (next <= end && cells[next] === code) next += 1;
  if (next > end) return null; // nothing after this stage in the block
  const k = next - (week + 1);
  if (k === 0) return null; // already moves on next week
  const out = { ...cells };
  for (let w = week + 1; w <= end; w += 1) {
    out[w] = w + k <= end ? cells[w + k] : cells[end];
  }
  return { cells: out, changed: diffWeeks(cells, out), overflow: false, newEnd: end };
}

function diffWeeks(a, b) {
  const weeks = new Set([...Object.keys(a), ...Object.keys(b)].map(Number));
  return [...weeks].filter((w) => a[w] !== b[w]).sort((x, y) => x - y);
}

/** Phases a changed block now reaches that need a warning. */
export function riskyPhases(weeks, changedWeeks) {
  const risky = new Set(['Taper', 'Peak', 'Break', 'Transition']);
  return [...new Set(changedWeeks
    .map((w) => weeks.find((x) => x.week_no === w)?.phase)
    .filter((p) => risky.has(p)))];
}
