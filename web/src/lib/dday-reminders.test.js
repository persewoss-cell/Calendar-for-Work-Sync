import test from 'node:test';
import assert from 'node:assert/strict';
import { daysLeft, ddayText, targetsInRange, todayCounters } from './dday.js';
import { reminderDue, reminderLabel } from './reminders.js';

test('D-day counters on today: visible, not passed, nearest first', () => {
  const list = [
    { _id: 'a', title: '방학', date: '2026-12-31', visible: true },
    { _id: 'b', title: '시험', date: '2026-11-26', visible: true },
    { _id: 'c', title: '숨김', date: '2026-11-30', visible: false },
    { _id: 'd', title: '지남', date: '2026-11-01', visible: true },
    { _id: 'e', title: '생일', date: '2000-03-05', repeatYearly: true, visible: true },
  ];
  const t = todayCounters(list, '2026-11-16').map((c) => `${ddayText(c.n)}(${c.title})`);
  assert.deepEqual(t, ['D-10(시험)', 'D-45(방학)', 'D-109(생일)']);
  assert.equal(ddayText(daysLeft(list[3], '2026-11-16')), 'D+15');
  assert.equal(ddayText(0), 'D-day');
});

test('D-day targets repeat yearly inside the visible range', () => {
  const m = targetsInRange([{ title: '생일', date: '2024-12-02', repeatYearly: true }, { title: '방학', date: '2026-12-31' }], '2026-11-01', '2027-01-09');
  assert.deepEqual([...m.keys()].sort(), ['2026-12-02', '2026-12-31']);
});

test('all-day reminders are clock times relative to the day', () => {
  assert.equal(reminderLabel({ startTime: null, reminder: -540 }), '당일 오전 9시');
  assert.equal(reminderLabel({ startTime: null, reminder: 180 }), '전날 오후 9시');
  assert.equal(reminderLabel({ startTime: null, reminder: -530 }), '당일 오전 8시 50분'); // migrated "10분 전"
  assert.equal(reminderLabel({ startTime: '15:30', reminder: 10 }), '10분 전');
  // due times in minutes from today's midnight
  assert.equal(reminderDue({ startTime: null, reminder: -540 }, '2026-11-17', '2026-11-16'), 1440 + 540);
  assert.equal(reminderDue({ startTime: null, reminder: 180 }, '2026-11-17', '2026-11-16'), 1260); // today 21:00
  assert.equal(reminderDue({ startTime: '00:05', reminder: 10 }, '2026-11-17', '2026-11-16'), 1435); // today 23:55
});
