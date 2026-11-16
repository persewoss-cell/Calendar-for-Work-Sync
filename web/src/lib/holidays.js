import { addDays, nthWeekday, weekday, ymd } from './date.js';
import { fromLunar } from './lunar.js';

// One-off national holidays (elections etc.) declared by the Korean government.
const KR_SPECIAL = {
  '2022-03-09': '대통령선거', '2022-06-01': '지방선거', '2024-04-10': '국회의원선거',
  '2025-06-03': '대통령선거', '2026-06-03': '지방선거', '2028-04-12': '국회의원선거',
};

const KR_OBSERVANCES = [
  ['02-14', '발렌타인데이'], ['03-14', '화이트데이'], ['04-05', '식목일'], ['05-01', '근로자의 날'],
  ['05-08', '어버이날'], ['05-15', '스승의 날'], ['07-17', '제헌절'], ['10-01', '국군의 날'],
  ['10-31', '할로윈'],
];

function add(map, date, name, type = 'holiday') {
  if (!date) return;
  if (!map.has(date)) map.set(date, []);
  map.get(date).push({ name, type });
}

const isHoliday = (map, d) => (map.get(d) || []).some((h) => h.type === 'holiday');

/** Next date after `from` that is a weekday (Mon–Fri) and not already a holiday. */
function nextFreeWeekday(map, from) {
  let d = addDays(from, 1);
  while ([0, 6].includes(weekday(d)) || isHoliday(map, d)) d = addDays(d, 1);
  return d;
}

export function koreanHolidays(year) {
  const map = new Map();
  const fixed = [['01-01', '신정'], ['03-01', '삼일절'], ['05-05', '어린이날'], ['06-06', '현충일'],
    ['08-15', '광복절'], ['10-03', '개천절'], ['10-09', '한글날'], ['12-25', '성탄절']];
  for (const [md, name] of fixed) add(map, `${year}-${md}`, name);

  const seollal = fromLunar(year, 1, 1);
  const seollalDays = seollal ? [addDays(seollal, -1), seollal, addDays(seollal, 1)] : [];
  seollalDays.forEach((d, i) => add(map, d, i === 1 ? '설날' : '설날 연휴'));
  const buddha = fromLunar(year, 4, 8);
  add(map, buddha, '부처님오신날');
  const chuseok = fromLunar(year, 8, 15);
  const chuseokDays = chuseok ? [addDays(chuseok, -1), chuseok, addDays(chuseok, 1)] : [];
  chuseokDays.forEach((d, i) => add(map, d, i === 1 ? '추석' : '추석 연휴'));
  for (const [d, name] of Object.entries(KR_SPECIAL)) if (d.startsWith(`${year}-`)) add(map, d, name);

  // 대체공휴일 (substitute holidays)
  const substitutes = [];
  const countOf = (d) => (map.get(d) || []).filter((h) => h.type === 'holiday').length;
  for (const days of [seollalDays, chuseokDays]) {
    // Lunar holidays: substitute when a day is Sunday or overlaps another holiday (Saturday doesn't count).
    if (days.length && days.some((d) => weekday(d) === 0 || countOf(d) > 1)) substitutes.push(days[2]);
  }
  const weekendRule = [[`${year}-05-05`, 2014], [`${year}-03-01`, 2021], [`${year}-08-15`, 2021],
    [`${year}-10-03`, 2021], [`${year}-10-09`, 2021], [buddha, 2023], [`${year}-12-25`, 2023]];
  for (const [d, since] of weekendRule) {
    if (d && year >= since && ([0, 6].includes(weekday(d)) || countOf(d) > 1)) substitutes.push(d);
  }
  substitutes.sort();
  for (const from of substitutes) {
    const target = nextFreeWeekday(map, from);
    add(map, target, '대체공휴일');
  }
  return map;
}

export function usHolidays(year) {
  const map = new Map();
  add(map, `${year}-01-01`, "New Year's Day");
  add(map, nthWeekday(year, 1, 1, 3), 'MLK Day');
  add(map, nthWeekday(year, 2, 1, 3), "Presidents' Day");
  add(map, nthWeekday(year, 5, 1, -1), 'Memorial Day');
  add(map, `${year}-06-19`, 'Juneteenth');
  add(map, `${year}-07-04`, 'Independence Day');
  add(map, nthWeekday(year, 9, 1, 1), 'Labor Day');
  add(map, nthWeekday(year, 10, 1, 2), 'Columbus Day');
  add(map, `${year}-11-11`, 'Veterans Day');
  add(map, nthWeekday(year, 11, 4, 4), '추수감사절');
  add(map, `${year}-12-25`, 'Christmas');
  return map;
}

export function koreanObservances(year) {
  const map = new Map();
  for (const [md, name] of KR_OBSERVANCES) add(map, `${year}-${md}`, name, 'observance');
  add(map, nthWeekday(year, 11, 4, 4), '추수감사절', 'observance');
  return map;
}

export const HOLIDAY_REGIONS = { KR: '대한민국', US: '미국' };

const cache = new Map();
/** All holidays/observances for a year as Map(date → [{name, type}]). */
export function holidaysOfYear(year, regions = ['KR'], observances = true) {
  const key = `${year}|${regions.join(',')}|${observances}`;
  if (cache.has(key)) return cache.get(key);
  const out = new Map();
  const merge = (m) => m.forEach((list, d) => list.forEach((h) => {
    const cur = out.get(d) || [];
    if (!cur.some((x) => x.name === h.name)) cur.push(h);
    out.set(d, cur);
  }));
  if (regions.includes('KR')) merge(koreanHolidays(year));
  if (regions.includes('US')) merge(usHolidays(year));
  if (observances) merge(koreanObservances(year));
  cache.set(key, out);
  return out;
}

export { ymd };
