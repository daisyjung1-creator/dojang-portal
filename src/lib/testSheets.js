// What each student does at the belt test, from the curriculum (by the belt
// they hold now) plus their own overrides (black stripes pick their break).
import { beltIndex } from './beltTesting';

export const SCORE_COLS = [
  ['품새', 'Poomsae'],
  ['베이직', 'Basic'],
  ['발차기', 'Kicking'],
  ['겨루기', 'Sparring'],
  ['격파', 'Break'],
  ['힘', 'Power'],
  ['기합', 'Kihap'],
];

export const LEADER_ROLES = ['Kick pad holder', 'Score Judge', 'Referee', 'Gear final check', 'Escort', 'Camera', 'Sparring Helper', 'Guarding', 'Group 1', 'Group 2', 'Group 3', 'Group 1 (Group 3 Assist)', 'Group 2 (Group 1 Assist)'];

export const DEFAULT_LEADER_NOTES = [
  '* Please double-check the colour of the headgear and chest gear!!!',
  'When they are in line, remind them to WEAR headgear and a face guard, and not hold it.',
  'At least 1 face protector is mandatory (face guard or mouth guard).',
  'Let Master Daisy know if anyone is missing any gear.',
  'NO Groin Guard = NO SPARRING',
].join('\n');

// "Black Stripe" = 0, "Black Stripe 3" = 3, otherwise null.
export function stripeNo(belt) {
  const m = String(belt || '').match(/^Black Stripe(?:\s+(\d))?$/);
  return m ? Number(m[1] || 0) : null;
}

// Black stripes test the poomsae of every stripe up to the one they go for
// (stripe n adds Taegeuk n and 9 − n): BS1 → 1, 8 · BS2 → 1, 2, 7, 8 ·
// BS3 → 1–3, 6–8 · BS4 → 1–8.
export function blackStripePoomsae(current, target) {
  const from = stripeNo(current);
  if (from == null) return '';
  const to = Math.min(stripeNo(target) ?? from + 1, 4);
  const set = new Set();
  for (let k = 1; k <= to; k++) [k, 9 - k].forEach((n) => set.add(n));
  return compactNumbers([...set].join(','));
}

// "1,2,3,6,7,8" → "1–3, 6–8"; anything that isn't a number list is left as is.
export function compactNumbers(text) {
  const raw = String(text || '').trim();
  const parts = raw.split(/[\s,]+/).filter(Boolean);
  if (!parts.length || !parts.every((x) => /^\d+$/.test(x))) return raw.replace(/^[,\s]+|[,\s]+$/g, '');
  const nums = [...new Set(parts.map(Number))].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < nums.length; i++) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    out.push(j - i >= 2 ? `${nums[i]}–${nums[j]}` : j > i ? `${nums[i]}, ${nums[j]}` : `${nums[i]}`);
    i = j;
  }
  return out.join(', ');
}

const curriculumKey = (belt) => (stripeNo(belt) != null ? 'Black Stripe' : belt);

export function planFor(e, curByBelt) {
  const c = curByBelt[curriculumKey(e.current_belt)] || {};
  const p = e.plan || {};
  const black = stripeNo(e.current_belt) != null;
  const pick = (k, auto) => (p[k] != null && p[k] !== '' ? p[k] : auto ?? '');
  return {
    black,
    poomsae: compactNumbers(pick('poomsae', black ? blackStripePoomsae(e.current_belt, e.target_belt) : c.poomsae)),
    basic_ko: c.basic_ko || '',
    basic_en: c.basic_en || '',
    kicking: c.kicking || '',
    break_ko: pick('break_ko', black ? '' : c.break_ko),
    break_en: pick('break_en', black ? '' : c.break_en),
    spot: c.spot || '',
    material: pick('material', c.material),
    sparring: beltIndex(e.current_belt) >= beltIndex('Yellow'),
  };
}

export const byBeltThenName = (a, b) => beltIndex(a.e.current_belt) - beltIndex(b.e.current_belt) || a.s.name.localeCompare(b.s.name);
