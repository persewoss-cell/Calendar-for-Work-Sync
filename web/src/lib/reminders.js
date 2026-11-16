import { diffDays } from './date.js';

// All-day items: the reminder is minutes before 00:00 of the day (negative = later that day).
export const ALL_DAY_REMINDERS = [
  { value: -420, label: '당일 오전 7시' },
  { value: -480, label: '당일 오전 8시' },
  { value: -540, label: '당일 오전 9시' },
  { value: -720, label: '당일 낮 12시' },
  { value: 360, label: '전날 오후 6시' },
  { value: 180, label: '전날 오후 9시' },
];
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
  const found = ALL_DAY_REMINDERS.find((o) => o.value === r);
  if (found) return found.label;
  const at = -r; // minutes after midnight of the day (may be negative = days before)
  const dayShift = Math.floor(at / 1440);
  const min = ((at % 1440) + 1440) % 1440;
  const day = dayShift === 0 ? '당일' : dayShift === -1 ? '전날' : `${-dayShift}일 전`;
  return `${day} ${hhmm(min)}`;
}

/**
 * When a reminder for occurrence day `day` fires, in minutes counted from 00:00 of `today`.
 * Timed: start − reminder. All-day: 00:00 of the day − reminder.
 */
export function reminderDue(item, day, today) {
  const base = diffDays(today, day) * 1440 + (item.startTime ? toMin(item.startTime) : 0);
  return base - item.reminder;
}
