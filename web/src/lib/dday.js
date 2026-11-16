import { diffDays, parts, ymd } from './date.js';

/** The date a D-day counts to (next yearly occurrence for repeating ones). */
export function nextOccurrence(card, today) {
  if (!card.repeatYearly) return card.date;
  const [ty] = parts(today);
  const [, m, d] = parts(card.date);
  const thisYear = ymd(ty, m, d);
  return thisYear >= today ? thisYear : ymd(ty + 1, m, d);
}

/** "D-45", "D-day", "D+3" */
export function ddayText(n) {
  return n === 0 ? 'D-day' : n > 0 ? `D-${n}` : `D+${-n}`;
}

export function daysLeft(card, today) {
  return diffDays(today, nextOccurrence(card, today));
}

/** D-days shown on today's cell: switched on, not yet passed, nearest first. */
export function todayCounters(countdowns, today) {
  return countdowns
    .filter((c) => c.visible !== false && c.date)
    .map((c) => ({ ...c, n: daysLeft(c, today) }))
    .filter((c) => c.n >= 0)
    .sort((a, b) => a.n - b.n);
}

/** Map(date → [D-day]) of target dates inside [from, to] (yearly ones repeat every year). */
export function targetsInRange(countdowns, from, to) {
  const out = new Map();
  const add = (date, c) => {
    if (date < from || date > to) return;
    if (!out.has(date)) out.set(date, []);
    out.get(date).push(c);
  };
  for (const c of countdowns) {
    if (!c.date) continue;
    if (!c.repeatYearly) { add(c.date, c); continue; }
    const [, m, d] = parts(c.date);
    for (let y = parts(from)[0]; y <= parts(to)[0]; y++) {
      const date = ymd(y, m, d);
      if (date >= c.date) add(date, c);
    }
  }
  return out;
}
