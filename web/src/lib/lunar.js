import KoreanLunarCalendar from 'korean-lunar-calendar';
import { parts, ymd } from './date.js';

const cal = new KoreanLunarCalendar();
const cache = new Map();

/** Solar "YYYY-MM-DD" → { month, day, leap } in the Korean lunar calendar (KASI data, 1000–2050). */
export function toLunar(s) {
  if (cache.has(s)) return cache.get(s);
  const [y, m, d] = parts(s);
  let out = null;
  if (cal.setSolarDate(y, m, d)) {
    const l = cal.getLunarCalendar();
    out = { year: l.year, month: l.month, day: l.day, leap: Boolean(l.intercalation) };
  }
  cache.set(s, out);
  return out;
}

/** Lunar date → solar "YYYY-MM-DD" (null if out of range). */
export function fromLunar(year, month, day, leap = false) {
  if (!cal.setLunarDate(year, month, day, leap)) return null;
  const s = cal.getSolarCalendar();
  return ymd(s.year, s.month, s.day);
}
