import * as rrulePkg from 'rrule';

// Works for both the ESM build (Vite) and the CJS build (node tests).
const RRule = rrulePkg.RRule || rrulePkg.default?.RRule;
import { addDays, diffDays, fromUTC, toUTC } from './date.js';

export const REPEAT_PRESETS = [
  { value: '', label: '반복 안 함' },
  { value: 'FREQ=DAILY', label: '매일' },
  { value: 'FREQ=WEEKLY', label: '매주' },
  { value: 'FREQ=WEEKLY;INTERVAL=2', label: '격주' },
  { value: 'FREQ=MONTHLY', label: '매월' },
  { value: 'FREQ=YEARLY', label: '매년' },
  { value: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', label: '평일마다' },
];

/**
 * Expand events into per-day occurrences inside [from, to].
 * Each occurrence: { ...event, key, occ (occurrence start date), day (the cell date), done }.
 */
export function expandEvents(events, from, to) {
  const byDay = new Map();
  const push = (day, item) => {
    if (day < from || day > to) return;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(item);
  };
  for (const ev of events) {
    const span = Math.max(0, diffDays(ev.date, ev.endDate || ev.date));
    let starts = [ev.date];
    if (ev.rrule) {
      try {
        const opts = RRule.parseString(ev.rrule.replace(/^RRULE:/, ''));
        const rule = new RRule({ ...opts, dtstart: toUTC(ev.date) });
        starts = rule.between(toUTC(addDays(from, -span)), toUTC(to), true).map(fromUTC)
          .filter((d) => !(ev.exdates || []).includes(d));
      } catch {
        starts = [ev.date];
      }
    }
    for (const occ of starts) {
      const done = ev.rrule ? (ev.doneDates || []).includes(occ) : ev.done;
      for (let i = 0; i <= span; i++) {
        const day = addDays(occ, i);
        push(day, { ...ev, key: `${ev._id}:${occ}:${i}`, occ, day, done, part: span ? [i + 1, span + 1] : null });
      }
    }
  }
  return byDay;
}

/** Order inside a cell: manual order, optionally finished items at the bottom. */
export function sortDay(items, doneToBottom) {
  return [...items].sort((a, b) => {
    if (doneToBottom && a.done !== b.done) return a.done ? 1 : -1;
    return (a.order ?? 0) - (b.order ?? 0) || (a.startTime || '').localeCompare(b.startTime || '');
  });
}
