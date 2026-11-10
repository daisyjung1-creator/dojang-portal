// node scripts/ytp/test_weight.mjs
import assert from 'node:assert/strict';
import { keyCompetitions, targetLine, weightStatus, windowFor, addDays } from '../../src/modules/hp/hpWeightLogic.js';

const weeks = [{ week_no: 12, week_start: '2026-11-23' }, { week_no: 26, week_start: '2027-03-01' }, { week_no: 28, week_start: '2027-03-15' }];
const events = [
  { name: 'Calgary Open', week_no: 12, priority: 'M', kind: 'competition' },
  { name: 'Nationals', week_no: 26, priority: 'H', kind: 'competition' },
  { name: 'Camp', week_no: 28, priority: 'H', kind: 'camp' },
];
const comps = keyCompetitions(events, weeks);
assert.deepEqual(comps, [{ name: 'Nationals', date: '2027-03-01' }]);
assert.equal(windowFor(comps, '2027-01-04'), comps[0]);     // exactly 56 days before → inside
assert.equal(windowFor(comps, '2027-01-03'), null);          // 57 days before → outside
assert.equal(windowFor(comps, '2027-03-02'), null);          // after

// Line from 55 kg at window start to 52 kg on the day
const ws = [{ date: '2027-01-04', weight_kg: 55 }, { date: '2027-01-31', weight_kg: 53.8 }];
const line = targetLine(ws, comps[0], 52);
assert.equal(line.from, 55);
assert.ok(Math.abs(line.at('2027-03-01') - 52) < 1e-9);
assert.ok(Math.abs(line.at(addDays('2027-01-04', 28)) - 53.5) < 0.01); // halfway

// Statuses
assert.equal(weightStatus(ws, comps, 52, '2027-01-31').status, 'behind');    // 53.8 > 53.55 target
assert.equal(weightStatus([...ws.slice(0, 1), { date: '2027-01-31', weight_kg: 53.3 }], comps, 52, '2027-01-31').status, 'on_track');
assert.equal(weightStatus([{ date: '2027-02-25', weight_kg: 52.4 }], comps, 52, '2027-02-25').status, 'over');
assert.equal(weightStatus([{ date: '2027-02-25', weight_kg: 51.9 }], comps, 52, '2027-02-25').status, 'under');
assert.equal(weightStatus([{ date: '2026-11-10', weight_kg: 56 }], comps, 52, '2026-11-10').status, 'off');
assert.equal(weightStatus([], comps, 52, '2026-11-10').status, null);
console.log('all weight tests passed');
