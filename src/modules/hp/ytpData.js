// YTP data loading + pure helpers (no React here, so they can be tested on their own).
import { supabase } from '../../supabaseClient';

export const AREAS = [
  { id: 'physical', label: 'Physical' },
  { id: 'technical', label: 'Technical' },
  { id: 'tactical', label: 'Tactical' },
  { id: 'mental', label: 'Mental' },
];

// Terms from NCCP Developing Athletic Abilities (Appendix B; section 5.3 for D/M on physical rows).
export const CODE_LABELS = {
  I: 'Introduced',
  D: 'Developed',
  C: 'Consolidated',
  R: 'Refined',
  M: 'Maintained',
  X: 'Trained this week',
};

const DAY = 24 * 60 * 60 * 1000;

function parseDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Week number (1-based) that contains `today`, or null if outside the season. */
export function currentWeekNo(seasonStartIso, weeks, today = new Date()) {
  const start = parseDate(seasonStartIso);
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const w = Math.floor(Math.round((t - start) / DAY) / 7) + 1;
  return w >= 1 && w <= weeks ? w : null;
}

/** First event in or after `fromWeek` (events sorted by week). */
export function nextEvent(events, fromWeek) {
  if (fromWeek == null) return null;
  return events
    .filter((e) => e.week_no >= fromWeek && e.kind !== 'break')
    .sort((a, b) => a.week_no - b.week_no)[0] || null;
}

/** Groups consecutive weeks with the same key: [{ key, start, span }]. */
export function runs(weeks, keyOf) {
  const out = [];
  weeks.forEach((w) => {
    const key = keyOf(w);
    const last = out[out.length - 1];
    if (last && last.key === key) last.span += 1;
    else out.push({ key, start: w.week_no, span: 1 });
  });
  return out;
}

export function monthLabel(iso) {
  return parseDate(iso).toLocaleString('en-CA', { month: 'short' });
}

export function shortDate(iso) {
  const d = parseDate(iso);
  return `${d.toLocaleString('en-CA', { month: 'short' })} ${d.getDate()}`;
}

// ── Loading ────────────────────────────────────────────────────────────

async function must(promise) {
  const { data, error } = await promise;
  if (error) throw error;
  return data || [];
}

/** Everything the athlete list needs: athletes, their plan, week phases and events. */
export async function loadOverview() {
  const [athletes, plans, seasons] = await Promise.all([
    must(supabase.from('hp_athletes').select('*').eq('active', true).order('display_name')),
    must(supabase.from('ytp_plans').select('id, athlete_id, season_id')),
    must(supabase.from('ytp_seasons').select('*').order('start_date', { ascending: false })),
  ]);
  const season = seasons[0] || null;
  const seasonPlans = plans.filter((p) => season && p.season_id === season.id);
  const planIds = seasonPlans.map((p) => p.id);
  const [weeks, events] = planIds.length
    ? await Promise.all([
        must(supabase.from('ytp_weeks').select('plan_id, week_no, phase').in('plan_id', planIds)),
        must(supabase.from('ytp_events').select('*').in('plan_id', planIds)),
      ])
    : [[], []];
  return {
    season,
    athletes: athletes.map((a) => {
      const plan = seasonPlans.find((p) => p.athlete_id === a.id) || null;
      return {
        ...a,
        plan,
        weeks: plan ? weeks.filter((w) => w.plan_id === plan.id) : [],
        events: plan ? events.filter((e) => e.plan_id === plan.id) : [],
      };
    }),
  };
}

/** Full plan for the grid. */
export async function loadPlan(planId) {
  const [weeks, events, rows] = await Promise.all([
    must(supabase.from('ytp_weeks').select('*').eq('plan_id', planId).order('week_no')),
    must(supabase.from('ytp_events').select('*').eq('plan_id', planId).order('week_no')),
    must(supabase.from('ytp_rows').select('*').eq('plan_id', planId).order('sort')),
  ]);
  const rowIds = rows.map((r) => r.id);
  const cells = rowIds.length
    ? await must(supabase.from('ytp_cells').select('row_id, week_no, code').in('row_id', rowIds).limit(5000))
    : [];
  const byRow = {};
  cells.forEach((c) => {
    (byRow[c.row_id] ||= {})[c.week_no] = c.code;
  });
  return { weeks, events, rows: rows.map((r) => ({ ...r, cells: byRow[r.id] || {} })) };
}
