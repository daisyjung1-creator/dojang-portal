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

// ── Saving (every change is saved right away) ─────────────────────────

export function weekRange(from, to) {
  const [a, b] = from <= to ? [from, to] : [to, from];
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

/** Set one code on several weeks of a row; code null clears them. */
export async function setCells(rowId, weekNos, code) {
  if (!code) {
    await must(supabase.from('ytp_cells').delete().eq('row_id', rowId).in('week_no', weekNos));
    return;
  }
  await must(supabase.from('ytp_cells').upsert(
    weekNos.map((w) => ({ row_id: rowId, week_no: w, code })),
    { onConflict: 'row_id,week_no' },
  ));
}

export async function updateWeeks(planId, weekNos, patch) {
  await must(supabase.from('ytp_weeks').update(patch).eq('plan_id', planId).in('week_no', weekNos));
}

// Events. With applyAll, the same event (same name + week before the change) in every
// plan of the season is changed too; a new event is added to every plan.
async function seasonPlanIds(planId) {
  const [plan] = await must(supabase.from('ytp_plans').select('season_id').eq('id', planId));
  const plans = await must(supabase.from('ytp_plans').select('id').eq('season_id', plan.season_id));
  return plans.map((p) => p.id);
}

async function matchingEventIds(event, applyAll) {
  if (!applyAll) return [event.id];
  const planIds = await seasonPlanIds(event.plan_id);
  const same = await must(supabase.from('ytp_events').select('id')
    .in('plan_id', planIds).eq('name', event.name).eq('week_no', event.week_no));
  return [...new Set([event.id, ...same.map((e) => e.id)])];
}

export async function addEvent(planId, fields, applyAll) {
  const planIds = applyAll ? await seasonPlanIds(planId) : [planId];
  await must(supabase.from('ytp_events').insert(planIds.map((id) => ({ ...fields, plan_id: id }))));
}

export async function updateEvent(event, fields, applyAll) {
  const ids = await matchingEventIds(event, applyAll);
  await must(supabase.from('ytp_events').update(fields).in('id', ids));
}

export async function deleteEvent(event, applyAll) {
  const ids = await matchingEventIds(event, applyAll);
  await must(supabase.from('ytp_events').delete().in('id', ids));
}

// Rows (skills / abilities)
export async function addRow(planId, area, name, sort) {
  await must(supabase.from('ytp_rows').insert({ plan_id: planId, area, name, sort }));
}

export async function renameRow(rowId, name) {
  await must(supabase.from('ytp_rows').update({ name }).eq('id', rowId));
}

export async function deleteRow(rowId) {
  await must(supabase.from('ytp_rows').delete().eq('id', rowId));
}

/** Swap the order of two rows. */
export async function swapRows(a, b) {
  await must(supabase.from('ytp_rows').update({ sort: b.sort }).eq('id', a.id));
  await must(supabase.from('ytp_rows').update({ sort: a.sort }).eq('id', b.id));
}
