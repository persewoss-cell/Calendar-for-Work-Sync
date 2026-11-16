// Calendar dates are plain "YYYY-MM-DD" strings in the user's timezone.
const pad = (n) => String(n).padStart(2, '0');

export const ymd = (y, m, d) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
};
export const parts = (s) => s.split('-').map(Number);
export const toUTC = (s) => { const [y, m, d] = parts(s); return new Date(Date.UTC(y, m - 1, d)); };
export const fromUTC = (dt) => `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
export const addDays = (s, n) => { const [y, m, d] = parts(s); return ymd(y, m, d + n); };
export const addMonths = (s, n) => { const [y, m] = parts(s); return ymd(y, m + n, 1); };
export const weekday = (s) => toUTC(s).getUTCDay();
export const diffDays = (a, b) => Math.round((toUTC(b) - toUTC(a)) / 864e5);
export const startOfWeek = (s, weekStart = 0) => addDays(s, -((weekday(s) - weekStart + 7) % 7));
export const monthStart = (s) => s.slice(0, 8) + '01';
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function todayIn(tz = 'Asia/Seoul', now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function nowTimeIn(tz = 'Asia/Seoul', now = new Date()) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
}

/** Week number; firstWeek = which calendar week of the year counts as week 1 (e.g. a school term). */
export function weekNumber(s, weekStart = 0, firstWeek = 1) {
  const [y] = parts(s);
  const base = startOfWeek(`${y}-01-01`, weekStart);
  const calWeek = Math.floor(diffDays(base, startOfWeek(s, weekStart)) / 7) + 1;
  const n = calWeek - (firstWeek - 1);
  return n > 0 ? n : calWeek;
}

/** nth weekday of a month: nth=-1 for the last one. */
export function nthWeekday(y, m, wd, nth) {
  if (nth > 0) {
    const first = weekday(ymd(y, m, 1));
    return ymd(y, m, 1 + ((wd - first + 7) % 7) + (nth - 1) * 7);
  }
  const lastDay = daysInMonth(y, m);
  const last = weekday(ymd(y, m, lastDay));
  return ymd(y, m, lastDay - ((last - wd + 7) % 7));
}

export const WEEKDAYS = {
  ko: ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'],
  koShort: ['일', '월', '화', '수', '목', '금', '토'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  enShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};
