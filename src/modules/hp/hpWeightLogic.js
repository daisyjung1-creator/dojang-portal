// Weight tracking: pure helpers (tested in scripts/ytp/test_weight.mjs).
//
// Coach's rule: weight comes down gradually over the 8 weeks before each high-priority (H) competition,
// reaching the category limit in the competition week. (Not in NCCP DAA — the coach's own standard.)

export const WINDOW_DAYS = 56; // 8 weeks

const DAY = 24 * 60 * 60 * 1000;
const toTime = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
export const daysBetween = (a, b) => Math.round((toTime(b) - toTime(a)) / DAY);
export const addDays = (iso, n) => new Date(toTime(iso) + n * DAY).toISOString().slice(0, 10);

/** H-priority competitions as { name, date (Monday of the event week) }, sorted. */
export function keyCompetitions(events, weeks) {
  return events
    .filter((e) => e.priority === 'H' && e.kind === 'competition')
    .map((e) => ({ name: e.name, date: weeks.find((w) => w.week_no === e.week_no)?.week_start }))
    .filter((e) => e.date)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** The competition whose 8-week window contains `date` (or null). */
export function windowFor(comps, date) {
  return comps.find((c) => daysBetween(date, c.date) >= 0 && daysBetween(date, c.date) <= WINDOW_DAYS) || null;
}

/**
 * Target line for one competition: a straight line from the weight at the start of the
 * 8-week window down to the limit on the competition date. If the athlete is already
 * at or under the limit, the target is simply the limit.
 */
export function targetLine(weighIns, comp, limit) {
  const start = addDays(comp.date, -WINDOW_DAYS);
  const before = weighIns.filter((w) => w.date <= start);
  const startW = before.length ? before[before.length - 1] : weighIns.find((w) => w.date > start && w.date <= comp.date);
  if (!startW) return null;
  const from = Math.max(Number(startW.weight_kg), limit);
  const fromDate = startW.date > start ? startW.date : start;
  return {
    comp, start: fromDate, end: comp.date, from, to: limit,
    at(date) {
      const span = daysBetween(fromDate, comp.date);
      if (span <= 0) return limit;
      const t = Math.min(1, Math.max(0, daysBetween(fromDate, date) / span));
      return from + (limit - from) * t;
    },
  };
}

/**
 * Status of the latest weigh-in:
 *   'under'    at or under the limit
 *   'on_track' in an 8-week window and at or below the target line
 *   'behind'   in a window and above the target line
 *   'over'     competition week (≤ 7 days) and still over the limit
 *   'off'      no H competition in the next 8 weeks (no warning)
 */
export function weightStatus(weighIns, comps, limit, today) {
  const latest = weighIns[weighIns.length - 1];
  if (!latest || !limit) return { status: null, latest: latest || null };
  const w = Number(latest.weight_kg);
  const comp = windowFor(comps, today) || windowFor(comps, latest.date);
  const over = Math.round((w - limit) * 10) / 10;
  if (w <= limit) return { status: 'under', latest, comp, over };
  if (!comp) return { status: 'off', latest, over };
  const daysLeft = daysBetween(today, comp.date);
  if (daysLeft <= 7) return { status: 'over', latest, comp, over, daysLeft };
  const line = targetLine(weighIns, comp, limit);
  const target = line ? line.at(latest.date) : limit;
  return { status: w > target + 0.05 ? 'behind' : 'on_track', latest, comp, over, daysLeft, target: Math.round(target * 10) / 10 };
}
