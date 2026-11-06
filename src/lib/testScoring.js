// Promotion Test Report — same sections, criteria and ranks as the dojang's
// "Promotion Test Report" spreadsheet (Sheet1 / 학생 리스트).
// Each criterion is marked 0–3; each section gets NI / MS / ES from its total.

export const DOJANG_NAME = 'Edmonton Champion Hankook Taekwondo';
export const DEFAULT_EXAMINER = 'Grand Master. Chang Hun Jung';

export const SECTIONS = [
  {
    key: 'poomsae',
    label: 'Poomsae',
    criteria: ['Basic Movements', "Each pattern's detail movements", 'Balance', 'Speed/Power', 'Harmony (fast/slow, intense/light, rhythm)'],
    // total: 0 → N/A, ≥11 ES, ≥7 MS, else NI
    rank: (t) => (t === 0 ? 'N/A' : t >= 11 ? 'ES' : t >= 7 ? 'MS' : 'NI'),
    scale: ['<7', '7-10 (no 0s)', '>10'],
  },
  {
    key: 'basic',
    label: 'Basic Movements',
    criteria: ['Movements', 'Expression of Energy'],
    rank: (t) => (t === 0 ? 'N/A' : t >= 5 ? 'ES' : t >= 3 ? 'MS' : 'NI'),
    scale: ['<3', '3~4', '>4'],
  },
  {
    key: 'kicking',
    label: 'Kicking Combo',
    criteria: ['Steps/ Accuracy', 'Speed/Power'],
    rank: (t) => (t >= 5 ? 'ES' : t >= 3 ? 'MS' : 'NI'),
    scale: ['<3', '3~4', '>4'],
  },
  {
    key: 'sparring',
    label: 'Sparring',
    criteria: ['Combination', 'Steps', 'Technical Point (spinning kicks)', 'Power/Speed/Gi-hab', 'Score (Accuracy)'],
    rank: (t) => (t === 0 ? 'N/A' : t >= 11 ? 'ES' : t >= 7 ? 'MS' : 'NI'),
    scale: ['<7', '7-10 (no 0s)', '>10'],
  },
  {
    key: 'board',
    label: 'Board Break',
    criteria: ['Movements', 'Power/Speed/Accuracy', 'Gi-hab'],
    rank: (t) => (t === 0 ? 'N/A' : t > 6 ? 'ES' : t >= 4 ? 'MS' : 'NI'),
    scale: ['<4', '4~6', '>6'],
  },
];

// Mental aspect: each element marked 0–3 → 0 NI, 1–2 MS, 3 ES.
export const MENTAL = {
  key: 'mental',
  label: 'Mental Aspect',
  criteria: ['In Class Attitude', 'Home Report Card', '5 Taekwondo Values'],
  note: '1. Courtesy  2. Integrity  3. Perseverance  4. Self-control  5. Indomitable Spirit',
};
export const mentalRank = (v) => (v == null || v === '' ? '' : Number(v) === 3 ? 'ES' : Number(v) >= 1 ? 'MS' : 'NI');

export const SCORE_GUIDE = [
  { n: 0, title: 'Not there.', text: 'No evidence appears on movements.' },
  { n: 1, title: 'Some evidence.', text: 'Movements have limited detail and insufficient accuracy to meet overall criteria.' },
  { n: 2, title: 'Good evidence.', text: 'Sufficient detail and accuracy to meet overall criteria; skills correspond to the belt.' },
  { n: 3, title: 'Exceptional evidence.', text: 'Excellent detail and accuracy to meet overall criteria.' },
];

export const RANK_LABEL = { NI: 'Need Improvement', MS: 'Meets Standard', ES: 'Exceeds Standard', 'N/A': 'N/A' };

const marks = (scores, key, n) => {
  const a = (scores && scores[key]) || [];
  return Array.from({ length: n }, (_, i) => (a[i] === '' || a[i] == null ? null : Number(a[i])));
};

// Totals and ranks for one student's scores.
export function summarize(scores) {
  const out = { sections: [], mental: [], complete: true, any: false };
  SECTIONS.forEach((sec) => {
    const m = marks(scores, sec.key, sec.criteria.length);
    const filled = m.filter((x) => x != null);
    if (filled.length) out.any = true;
    if (filled.length !== m.length) out.complete = false;
    const total = filled.reduce((t, x) => t + x, 0);
    out.sections.push({ ...sec, marks: m, total, max: sec.criteria.length * 3, rank: filled.length ? sec.rank(total) : '' });
  });
  const mm = marks(scores, MENTAL.key, MENTAL.criteria.length);
  mm.forEach((v, i) => {
    if (v != null) out.any = true;
    else out.complete = false;
    out.mental.push({ label: MENTAL.criteria[i], value: v, rank: mentalRank(v) });
  });
  return out;
}

export const RANK_COLOR = { ES: '#2A5A30', MS: '#1E4566', NI: '#9A2B2B', 'N/A': '#8A8D84' };

// ── Sparring pairings ────────────────────────────────────────────────────────
// Students on the test list from Yellow belt up, paired with the closest
// belt, then age. An odd one out gets a second match with the nearest student.
export function makePairs(people) {
  // people: [{ id, beltIndex, age }]
  const list = [...people].sort((a, b) => b.beltIndex - a.beltIndex || (a.age ?? 99) - (b.age ?? 99));
  const pairs = [];
  for (let i = 0; i + 1 < list.length; i += 2) pairs.push({ red: list[i].id, blue: list[i + 1].id });
  if (list.length % 2 === 1 && list.length > 1) pairs.push({ red: list[list.length - 1].id, blue: list[list.length - 2].id, extra: true });
  return pairs;
}
