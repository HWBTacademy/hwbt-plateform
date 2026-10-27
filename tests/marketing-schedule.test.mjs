import {test} from 'node:test';
import assert from 'node:assert/strict';
import {brusselsMorning} from '../netlify/functions/_lib/marketing-schedule.mts';
test('08h Brussels matches UTC summer and winter schedules',()=>{
 assert.equal(brusselsMorning(new Date('2026-07-01T06:00:00Z')).isMorning,true);
 assert.equal(brusselsMorning(new Date('2026-07-01T07:00:00Z')).isMorning,false);
 assert.equal(brusselsMorning(new Date('2026-12-01T07:00:00Z')).isMorning,true);
 assert.equal(brusselsMorning(new Date('2026-12-01T06:00:00Z')).isMorning,false);
});
