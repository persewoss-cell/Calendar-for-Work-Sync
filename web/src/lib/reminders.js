import { diffDays } from './date.js';

// All-day items: the reminder is minutes before 00:00 of the day (negative = later that day),
// chosen in the dialog as "which day" + "what time".
export const ALL_DAY_DAYS = [
  { value: 0, label: '당일' },
  { value: 1, label: '전일' },
  { value: 3, label: '3일 전' },
  { value: 7, label: '일주일 전' },
];

const pad = (n) => String(n).padStart(2, '0');

/** All-day reminder minutes → { daysBefore, time: "HH:MM" }. */
export function splitAllDay(reminder) {
  const at = -reminder; // minutes after 00:00 of the item's day
  const shift = Math.floor(at / 1440); // 0 = same day, -1 = day before …
  const min = at - shift * 1440;
  return { daysBefore: shift === 0 ? 0 : -shift, time: `${pad(Math.floor(min / 60))}:${pad(min % 60)}` };
}

/** { daysBefore, time } → all-day reminder minutes. */
export function joinAllDay(daysBefore, time) {
  const [h, m] = time.split(':').map(Number);
  return daysBefore * 1440 - (h * 60 + m);
}

export const TIMED_REMINDERS = [
  { value: 0, label: '정시' }, { value: 5, label: '5분 전' }, { value: 10, label: '10분 전' },
  { value: 15, label: '15분 전' }, { value: 30, label: '30분 전' }, { value: 60, label: '1시간 전' },
  { value: 120, label: '2시간 전' }, { value: 1440, label: '1일 전' },
];

const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const hhmm = (min) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${ampm} ${h12}시${m ? ` ${m}분` : ''}`;
};

/** Human label for a reminder, e.g. "10분 전" or "당일 오전 9시" / "전날 오후 9시". */
export function reminderLabel(item) {
  const r = item.reminder;
  if (r == null) return '';
  if (item.startTime) {
    const found = TIMED_REMINDERS.find((o) => o.value === r);
    if (found) return found.label;
    return r < 60 ? `${r}분 전` : r < 1440 ? `${Math.round(r / 60)}시간 전` : `${Math.round(r / 1440)}일 전`;
  }
  const { daysBefore, time } = splitAllDay(r);
  const [h, m] = time.split(':').map(Number);
  const day = (ALL_DAY_DAYS.find((d) => d.value === daysBefore) || { label: daysBefore < 0 ? `${-daysBefore}일 후` : `${daysBefore}일 전` }).label;
  return `${day} ${hhmm(h * 60 + m)}`;
}

/**
 * When a reminder for occurrence day `day` fires, in minutes counted from 00:00 of `today`.
 * Timed: start − reminder. All-day: 00:00 of the day − reminder.
 */
export function reminderDue(item, day, today) {
  const base = diffDays(today, day) * 1440 + (item.startTime ? toMin(item.startTime) : 0);
  return base - item.reminder;
}
