// node scripts/ytp/test_tracking.mjs
import assert from 'node:assert/strict';
import { extendStage, advanceStage, weekActuals, physicalStatus, classMinutes, riskyPhases } from '../../src/modules/hp/ytpTracking.js';

const row = (s, start = 1) => Object.fromEntries([...s].map((c, i) => [start + i, c]).filter(([, c]) => c !== '.'));
const str = (cells, from, to) => Array.from({ length: to - from + 1 }, (_, i) => cells[from + i] || '.').join('');

// Reverse Kick (Winter): weeks 6-10 D, 11-15 C, break 16-17, 18-24 C, 25 R
const rk = row('.....DDDDDCCCCC..CCCCCCCR');
let r = extendStage(rk, 10);
assert.equal(str(r.cells, 1, 26), '.....DDDDDDCCCCC.CCCCCCCR.'); // one more D; C moves into week 16 (was blank)
assert.equal(r.overflow, false);
assert.deepEqual(r.changed, [11, 16]);

// Extending in the middle of a C run
r = extendStage(rk, 12);
assert.equal(str(r.cells, 6, 17), 'DDDDDCCCCCC.');

// Block ending at the season end drops the last week and flags overflow
r = extendStage(row('MMM', 50), 51);
assert.equal(r.overflow, true);
assert.equal(str(r.cells, 50, 52), 'MMM');

// Next block starts right after: overflow warning
r = extendStage(row('DDCC.', 1), 1, 5);
assert.equal(r.overflow, false);
r = extendStage(row('DDCCRR', 1), 4, 6);
assert.equal(str(r.cells, 1, 6), 'DDCCCR');
assert.equal(r.overflow, true);

// Advance: ready at week 7 of D (6-10) → C starts week 8, block still ends week 15
r = advanceStage(rk, 7);
assert.equal(str(r.cells, 1, 17), '.....DDCCCCCCCC..');
assert.equal(str(r.cells, 18, 25), 'CCCCCCCR'); // later block untouched
// Advance with nothing after in the block
assert.equal(advanceStage(row('CCC'), 2), null);
// Advance in last week of stage is a no-op
assert.equal(advanceStage(row('DDCC'), 2), null);

// Actuals
const schedule = [
  { class_name: 'HP', weekday: 2, start_time: '19:30', end_time: '20:30' },
  { class_name: 'Comp Team', weekday: 6, start_time: '10:00', end_time: '13:30' },
  { class_name: 'Advance Sparring', weekday: 2, start_time: '18:30', end_time: '19:30' },
];
assert.equal(classMinutes(schedule, 'Comp Team', '2026-11-14'), 210);
const a = weekActuals({
  attendance: [
    { class_name: 'HP', date: '2026-11-10', status: 'present' },
    { class_name: 'Advance Sparring', date: '2026-11-10', status: 'double' },
    { class_name: 'Comp Team', date: '2026-11-14', status: 'present' },
    { class_name: 'HP', date: '2026-11-12', status: 'absent' },
    { class_name: 'Private', date: '2026-11-13', status: 'private', minutes: 45 },
  ],
  sessions: [{ minutes: 30, abilities: ['Flexibility'] }],
  schedule,
  classMap: { HP: ['Aerobic Stamina', 'Speed'], 'Advance Sparring': ['Aerobic Stamina', 'Speed'], 'Comp Team': ['*'] },
  physicalAbilities: ['Aerobic Stamina', 'Flexibility', 'Strength Endurance'],
});
assert.deepEqual(a.byClass, { HP: 1, 'Advance Sparring': 2, 'Comp Team': 1, Private: 1, Individual: 1 });
assert.equal(a.hours, (60 + 120 + 210 + 45 + 30) / 60 > 7.7 ? 7.8 : a.hours);
assert.deepEqual(a.abilityCounts, { 'Aerobic Stamina': 4, Flexibility: 2, 'Strength Endurance': 1 });

assert.equal(physicalStatus('Aerobic Stamina', 'D', 3), 'ok');
assert.equal(physicalStatus('Aerobic Stamina', 'D', 2), 'low');
assert.equal(physicalStatus('Speed', 'M', 0), 'none');
assert.equal(physicalStatus('Flexibility', null, 0), null);

assert.deepEqual(riskyPhases([{ week_no: 26, phase: 'Peak' }, { week_no: 24, phase: 'Competition' }], [24, 26]), ['Peak']);
console.log('all tracking tests passed');
