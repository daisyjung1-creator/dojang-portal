// A student can be in several classes. They're stored together in
// students.class_name, separated by commas: "Advance Sparring, HP".

// The dojang's regular classes, shown as quick picks.
export const DOJANG_CLASSES = [
  'Beginner',
  'Intermediate B',
  'Beginner/Intermediate',
  'Intermediate A',
  'Intermediate/Advance',
  'Advance Poomsae',
  'Advance Sparring',
  'HP',
  'Comp Team',
];

export function splitClasses(v) {
  return String(v || '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
}

export function joinClasses(list) {
  return Array.from(new Set(list.map((c) => c.trim()).filter(Boolean))).join(', ');
}

// Every class in use, regular ones first in schedule order, then any others A–Z.
export function allClassNames(students = []) {
  const used = new Set();
  students.forEach((s) => splitClasses(s.class_name).forEach((c) => used.add(c)));
  const extra = [...used].filter((c) => !DOJANG_CLASSES.includes(c)).sort();
  return [...DOJANG_CLASSES, ...extra];
}

export function inClass(student, className) {
  return splitClasses(student.class_name).includes(className);
}
