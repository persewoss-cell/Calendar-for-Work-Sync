import test from 'node:test';
import assert from 'node:assert/strict';
import { fromGoogle, toGoogle } from '../src/lib/googleSync.js';

const tz = 'Asia/Seoul';

test('all-day multi-day event: inclusive endDate ↔ exclusive Google end', () => {
  const body = toGoogle({ _id: 'x', title: '출장', date: '2026-11-18', endDate: '2026-11-20', reminder: null }, tz);
  assert.deepEqual(body.start, { date: '2026-11-18', dateTime: null });
  assert.deepEqual(body.end, { date: '2026-11-21', dateTime: null });
  assert.deepEqual(body.reminders, { useDefault: true });
  const back = fromGoogle({ summary: '출장', start: { date: '2026-11-18' }, end: { date: '2026-11-21' } }, tz);
  assert.equal(back.date, '2026-11-18');
  assert.equal(back.endDate, '2026-11-20');
  assert.equal(back.startTime, null);
});

test('timed event without end time defaults to one hour, with reminder', () => {
  const body = toGoogle({ _id: 'x', title: '컨설팅', date: '2026-11-24', startTime: '23:30', reminder: 30 }, tz);
  assert.equal(body.start.dateTime, '2026-11-24T23:30:00');
  assert.equal(body.end.dateTime, '2026-11-25T00:30:00');
  assert.equal(body.start.timeZone, tz);
  assert.deepEqual(body.reminders.overrides, [{ method: 'popup', minutes: 30 }]);
});

test('Google UTC times are converted to the user timezone', () => {
  const ev = fromGoogle({
    summary: '회의', start: { dateTime: '2026-11-24T06:30:00Z' }, end: { dateTime: '2026-11-24T07:30:00Z' },
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 10 }] },
  }, tz);
  assert.equal(ev.date, '2026-11-24');
  assert.equal(ev.startTime, '15:30');
  assert.equal(ev.endTime, '16:30');
  assert.equal(ev.reminder, 10);
});

test('recurrence with exdates round-trips', () => {
  const body = toGoogle({ _id: 'x', title: '국악', date: '2026-11-03', startTime: '10:00', rrule: 'FREQ=WEEKLY', exdates: ['2026-11-10'] }, tz);
  assert.deepEqual(body.recurrence, ['RRULE:FREQ=WEEKLY', 'EXDATE;TZID=Asia/Seoul:20261110T100000']);
  const back = fromGoogle({
    summary: '국악', start: { dateTime: '2026-11-03T10:00:00+09:00' }, end: { dateTime: '2026-11-03T11:00:00+09:00' },
    recurrence: ['RRULE:FREQ=WEEKLY', 'EXDATE;TZID=Asia/Seoul:20261110T100000', 'EXDATE:20261117T010000Z'],
  }, tz);
  assert.equal(back.rrule, 'FREQ=WEEKLY');
  assert.deepEqual(back.exdates, ['2026-11-10', '2026-11-17']);
});

test('app-only fields travel in private extended properties', () => {
  const body = toGoogle({ _id: 'abc', title: 't', date: '2026-11-03', color: '#ef5350', done: true }, tz);
  assert.deepEqual(body.extendedProperties.private, { workcalId: 'abc', color: '#ef5350', done: '1' });
  const back = fromGoogle({ summary: 't', start: { date: '2026-11-03' }, end: { date: '2026-11-04' }, extendedProperties: { private: { color: '#ef5350', done: '1' } } }, tz);
  assert.equal(back.color, '#ef5350');
  assert.equal(back.done, true);
});
