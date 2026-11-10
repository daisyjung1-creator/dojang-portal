// Fitness tests: loading, saving and pure helpers.
import { supabase } from '../../supabaseClient';

async function must(promise) {
  const { data, error } = await promise;
  if (error) throw error;
  return data || [];
}

export const sideKey = (itemKey, side) => `${itemKey}|${side}`;

/** Columns for the entry table: one per item, or one per side. */
export function columnsFor(items) {
  return items.flatMap((it) => (it.sides
    ? [{ item: it, side: 'L', label: `${it.name} L` }, { item: it, side: 'R', label: `${it.name} R` }]
    : [{ item: it, side: '', label: it.name }]));
}

/** "full" (front split) → 0; blank → null; otherwise a number or NaN. */
export function parseValue(text) {
  const t = String(text ?? '').trim();
  if (!t) return null;
  if (/^full$/i.test(t)) return 0;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

export function fmtValue(v) {
  if (v == null) return '';
  const n = Number(v);
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/**
 * History for one student: { [itemKey|side]: [{ date, value }] } sorted by date,
 * plus a summary per column: latest, previous, change, changePct, trend ('better'|'worse'|'same'|null).
 */
export function summarize(items, results) {
  const hist = {};
  results.forEach((r) => {
    (hist[sideKey(r.item_key, r.side)] ||= []).push({ date: r.test_date, value: Number(r.value) });
  });
  Object.values(hist).forEach((h) => h.sort((a, b) => (a.date < b.date ? -1 : 1)));
  const summary = {};
  columnsFor(items).forEach(({ item, side }) => {
    const h = hist[sideKey(item.key, side)] || [];
    const latest = h[h.length - 1] || null;
    const previous = h[h.length - 2] || null;
    let change = null;
    let changePct = null;
    let trend = null;
    if (latest && previous) {
      change = latest.value - previous.value;
      changePct = previous.value !== 0 ? (change / Math.abs(previous.value)) * 100 : null;
      if (item.better && change !== 0) {
        trend = (change > 0) === (item.better === 'higher') ? 'better' : 'worse';
      } else if (item.better) trend = 'same';
    }
    summary[sideKey(item.key, side)] = { history: h, latest, previous, change, changePct, trend };
  });
  return summary;
}

/** Left/right difference in % of the larger side (latest test where both sides exist). */
export function asymmetry(summary, item) {
  const l = summary[sideKey(item.key, 'L')]?.latest;
  const r = summary[sideKey(item.key, 'R')]?.latest;
  if (!l || !r || l.date !== r.date) return null;
  const big = Math.max(Math.abs(l.value), Math.abs(r.value));
  if (big === 0) return 0;
  return (Math.abs(l.value - r.value) / big) * 100;
}

// ── Loading / saving ─────────────────────────────────────────────────

export async function loadTestBase() {
  const [items, students, dates] = await Promise.all([
    must(supabase.from('fit_test_items').select('*').eq('active', true).order('sort')),
    must(supabase.from('students').select('id, name, class_name, status').eq('status', 'active')
      .ilike('class_name', '%Comp Team%').order('name')),
    must(supabase.from('fit_test_results').select('test_date').limit(10000)),
  ]);
  return { items, students, dates: [...new Set(dates.map((d) => d.test_date))].sort().reverse() };
}

export async function loadDateResults(testDate) {
  const [results, notes] = await Promise.all([
    must(supabase.from('fit_test_results').select('*').eq('test_date', testDate).limit(10000)),
    must(supabase.from('fit_test_notes').select('*').eq('test_date', testDate)),
  ]);
  return { results, notes };
}

export async function loadStudentResults(studentId) {
  const [items, results, notes] = await Promise.all([
    must(supabase.from('fit_test_items').select('*').eq('active', true).order('sort')),
    must(supabase.from('fit_test_results').select('*').eq('student_id', studentId).order('test_date')),
    must(supabase.from('fit_test_notes').select('*').eq('student_id', studentId).order('test_date')),
  ]);
  return { items, results, notes };
}

export async function saveResult(studentId, testDate, itemKey, side, value) {
  if (value == null) {
    await must(supabase.from('fit_test_results').delete()
      .eq('student_id', studentId).eq('test_date', testDate).eq('item_key', itemKey).eq('side', side));
    return;
  }
  await must(supabase.from('fit_test_results').upsert(
    { student_id: studentId, test_date: testDate, item_key: itemKey, side, value, updated_at: new Date().toISOString() },
    { onConflict: 'student_id,test_date,item_key,side' },
  ));
}

export async function saveNote(studentId, testDate, note) {
  if (!note) {
    await must(supabase.from('fit_test_notes').delete().eq('student_id', studentId).eq('test_date', testDate));
    return;
  }
  await must(supabase.from('fit_test_notes').upsert(
    { student_id: studentId, test_date: testDate, note },
    { onConflict: 'student_id,test_date' },
  ));
}
