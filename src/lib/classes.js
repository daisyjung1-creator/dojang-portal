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

// One colour per class (DESIGN.md → Class colours): dark text on a light tint.
// Use these wherever a class is shown as a chip so each class is easy to spot.
export const CLASS_COLORS = {
  Beginner: { text: '#27500A', bg: '#EAF3DE' },
  'Intermediate B': { text: '#0C447C', bg: '#E6F1FB' },
  'Beginner/Intermediate': { text: '#085041', bg: '#E1F5EE' },
  'Intermediate A': { text: '#3C3489', bg: '#EEEDFE' },
  'Intermediate/Advance': { text: '#72243E', bg: '#FBEAF0' },
  'Advance Poomsae': { text: '#633806', bg: '#FAEEDA' },
  'Advance Sparring': { text: '#791F1F', bg: '#FCEBEB' },
  HP: { text: '#8A3A08', bg: '#FDEBDD' },
  'Comp Team': { text: '#2C2C2A', bg: '#E9E7E0' },
};
export const classColor = (name) => CLASS_COLORS[String(name || '').trim()] || { text: 'var(--dp-ink)', bg: 'var(--dp-canvas)' };

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

// Does the student come to this class on this weekday? (students.class_days;
// empty = every scheduled day of their classes)
export function comesOn(student, weekday, className) {
  const days = student.class_days;
  return !days || !days.length || days.includes(`${weekday}:${className}`);
}

// The weekly class times this student is expected at (schedule rows), by weekday.
export function weeklyPlan(student, schedule = []) {
  const mine = splitClasses(student?.class_name);
  return schedule
    .filter((c) => c.active !== false && mine.includes(c.class_name) && comesOn(student, c.weekday, c.class_name))
    .sort((a, b) => a.weekday - b.weekday || String(a.start_time).localeCompare(String(b.start_time)));
}
