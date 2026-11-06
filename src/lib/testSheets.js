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

// Black stripes test the poomsae of each stripe they go for: stripe n →
// Taegeuk n and 9 − n (1 & 8, 2 & 7, 3 & 6, 4 & 5).
export function blackStripePoomsae(current, target) {
  const from = stripeNo(current);
  if (from == null) return '';
  const to = stripeNo(target) ?? from + 1;
  const set = new Set();
  for (let k = from + 1; k <= Math.min(to, 4); k++) [k, 9 - k].forEach((n) => set.add(n));
  return [...set].sort((a, b) => a - b).join(', ');
}

const curriculumKey = (belt) => (stripeNo(belt) != null ? 'Black Stripe' : belt);

export function planFor(e, curByBelt) {
  const c = curByBelt[curriculumKey(e.current_belt)] || {};
  const p = e.plan || {};
  const black = stripeNo(e.current_belt) != null;
  const pick = (k, auto) => (p[k] != null && p[k] !== '' ? p[k] : auto ?? '');
  return {
    black,
    poomsae: pick('poomsae', black ? blackStripePoomsae(e.current_belt, e.target_belt) : c.poomsae),
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
