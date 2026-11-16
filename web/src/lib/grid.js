import { addDays, addMonths, diffDays, monthStart, parts, startOfWeek } from './date.js';

/** Build the visible grid for a view style. Returns { rows: string[][], columns, from, to }. */
export function buildGrid(s, anchor) {
  const ws = Number(s.weekStart) || 0;
  let start;
  let rows;
  let columns = 7;
  switch (s.viewStyle) {
    case 'rolling':
      start = addDays(startOfWeek(anchor, ws), -7 * (Number(s.pastWeeks) || 0));
      rows = Math.max(1, Number(s.maxRows) || 5);
      break;
    case 'week':
      start = startOfWeek(anchor, ws);
      rows = 1;
      break;
    case 'strip':
      columns = Math.max(3, Number(s.maxColumns) || 7);
      start = addDays(anchor, -Math.floor((columns - 1) / 2));
      rows = 1;
      break;
    default: {
      const first = monthStart(anchor);
      const [y, m] = parts(first);
      start = startOfWeek(first, ws);
      const lastDay = addDays(addMonths(first, 1), -1);
      rows = Math.ceil((diffDays(start, lastDay) + 1) / 7);
      if (Number(s.maxRows) > rows && s.viewStyle === 'month') rows = Math.min(6, Number(s.maxRows));
      void y; void m;
    }
  }
  const grid = [];
  for (let r = 0; r < rows; r++) {
    grid.push(Array.from({ length: columns }, (_, c) => addDays(start, r * columns + c)));
  }
  return { rows: grid, columns, from: grid[0][0], to: grid[rows - 1][columns - 1] };
}

/** Where the arrows move to for each view style. */
export function stepAnchor(s, anchor, dir) {
  switch (s.viewStyle) {
    case 'month': return addMonths(anchor, dir);
    case 'strip': return addDays(anchor, dir);
    default: return addDays(anchor, 7 * dir);
  }
}

export const anchorFor = (s, date) => (s.viewStyle === 'month' ? monthStart(date) : date);
