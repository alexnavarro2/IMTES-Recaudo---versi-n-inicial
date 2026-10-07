import test from 'node:test';
import assert from 'node:assert/strict';
import { lastClosedWeek } from '../lib/iso-week';
test('historical cutoff is the previous closed ISO week in Hermosillo',()=>{assert.deepEqual(lastClosedWeek(new Date('2026-10-06T16:00:00Z')),{year:2026,week:40});assert.deepEqual(lastClosedWeek(new Date('2026-10-12T16:00:00Z')),{year:2026,week:41});});
test('Sunday remains open until Monday in Hermosillo',()=>{assert.deepEqual(lastClosedWeek(new Date('2026-10-12T06:59:59Z')),{year:2026,week:40});assert.deepEqual(lastClosedWeek(new Date('2026-10-12T07:00:00Z')),{year:2026,week:41});});
test('cutoff crosses ISO years and handles week 53',()=>{assert.deepEqual(lastClosedWeek(new Date('2027-01-04T16:00:00Z')),{year:2026,week:53});assert.deepEqual(lastClosedWeek(new Date('2026-01-01T16:00:00Z')),{year:2025,week:52});});
