import test from 'node:test';
import assert from 'node:assert/strict';
import { koreanHolidays, holidaysOfYear } from './holidays.js';
import { solarTermsOfYear } from './solarTerms.js';
import { toLunar } from './lunar.js';
import { expandEvents } from './recurrence.js';
import { weekNumber, nthWeekday } from './date.js';

const names = (m, d) => (m.get(d) || []).map((h) => h.name);

test('2026 Korean holidays incl. substitutes', () => {
  const h = koreanHolidays(2026);
  assert.deepEqual(names(h, '2026-02-17'), ['설날']);
  assert.ok(names(h, '2026-03-02').includes('대체공휴일')); // 삼일절 on Sunday
  assert.deepEqual(names(h, '2026-05-24'), ['부처님오신날']);
  assert.ok(names(h, '2026-05-25').includes('대체공휴일'));
  assert.ok(names(h, '2026-08-17').includes('대체공휴일'));
  assert.deepEqual(names(h, '2026-09-25'), ['추석']);
  assert.ok(names(h, '2026-10-05').includes('대체공휴일'));
  assert.deepEqual(names(h, '2026-06-03'), ['지방선거']);
});

test('2025 chuseok overlapping 개천절 gets a substitute day', () => {
  const h = koreanHolidays(2025);
  assert.ok(names(h, '2025-10-03').includes('개천절'));
  assert.ok(names(h, '2025-10-08').includes('대체공휴일'));
});

test('solar terms match the KASI table', () => {
  const t26 = solarTermsOfYear(2026);
  assert.equal(t26.get('2026-11-07'), '입동');
  assert.equal(t26.get('2026-11-22'), '소설');
  assert.equal(t26.get('2026-02-04'), '입춘');
  assert.equal(t26.get('2026-12-22'), '동지');
  assert.equal(solarTermsOfYear(2025).get('2025-03-20'), '춘분');
  assert.equal(t26.size, 24);
});

test('lunar conversion', () => {
  assert.deepEqual(toLunar('2026-11-16'), { year: 2026, month: 10, day: 8, leap: false });
});

test('observances include 추수감사절 on 4th Thursday of November', () => {
  assert.equal(nthWeekday(2026, 11, 4, 4), '2026-11-26');
  assert.ok(names(holidaysOfYear(2026, ['KR'], true), '2026-11-26').includes('추수감사절'));
});

test('weekly repeat expands with exdates and multi-day spans', () => {
  const events = [
    { _id: 'a', title: '국악', date: '2026-11-03', endDate: '2026-11-03', rrule: 'FREQ=WEEKLY', exdates: ['2026-11-10'], doneDates: ['2026-11-17'] },
    { _id: 'b', title: '출장', date: '2026-11-18', endDate: '2026-11-20', rrule: '' },
  ];
  const days = expandEvents(events, '2026-11-01', '2026-11-30');
  assert.equal(days.get('2026-11-10'), undefined);
  assert.equal(days.get('2026-11-17')[0].done, true);
  assert.equal(days.get('2026-11-24')[0].done, false);
  assert.deepEqual(days.get('2026-11-19')[0].part, [2, 3]);
});

test('week number honours first-week setting', () => {
  assert.equal(weekNumber('2026-01-01'), 1);
  assert.equal(weekNumber('2026-03-03', 0, 10), 1);
});

import { fromICS, toICS } from './ics.js';
test('ICS round trip keeps all-day ranges and times', () => {
  const ics = toICS([
    { _id: '1', title: '출장, 서울', date: '2026-11-18', endDate: '2026-11-19' },
    { _id: '2', title: '컨설팅', date: '2026-11-24', endDate: '2026-11-24', startTime: '15:30', endTime: '16:30', rrule: 'FREQ=WEEKLY' },
  ]);
  const back = fromICS(ics);
  assert.equal(back[0].title, '출장, 서울');
  assert.equal(back[0].endDate, '2026-11-19');
  assert.equal(back[0].startTime, null);
  assert.equal(back[1].startTime, '15:30');
  assert.equal(back[1].rrule, 'FREQ=WEEKLY');
});
