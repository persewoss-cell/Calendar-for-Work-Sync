import { useMemo } from 'react';
import { DayCell } from './DayCell.jsx';
import { holidaysOfYear } from '../lib/holidays.js';
import { solarTermsOfYear } from '../lib/solarTerms.js';
import { toLunar } from '../lib/lunar.js';
import { parts, weekNumber, weekday, WEEKDAYS } from '../lib/date.js';
import { sortDay } from '../lib/recurrence.js';

function dayInfo(date, s) {
  const [y] = parts(date);
  const holidays = s.showHolidays
    ? holidaysOfYear(y, s.holidayRegions || ['KR'], s.showObservances).get(date) || []
    : [];
  const solarTerm = s.showSolarTerms ? solarTermsOfYear(y).get(date) : null;
  let lunar = null;
  if (s.showLunar) {
    const l = toLunar(date);
    if (l) lunar = l.day === 1 ? `음 ${l.leap ? '윤' : ''}${l.month}.1` : `${l.month}.${l.day}`;
  }
  return { holidays, solarTerm, lunar };
}

export function CalendarView({ grid, s, today, anchor, byDay, days = {}, editingDate, highlightDate, compact, handlers }) {
  const names = s.language === 'en' ? (compact ? WEEKDAYS.enShort : WEEKDAYS.en) : (compact ? WEEKDAYS.koShort : WEEKDAYS.ko);
  const anchorMonth = anchor.slice(0, 7);
  const showWeekCol = s.weekNumbers;

  const rows = useMemo(() => grid.rows.map((row, r) => row.map((date, c) => {
    const info = dayInfo(date, s);
    const isRest = (s.showRestDays && (s.restDays || []).includes(weekday(date)))
      || info.holidays.some((h) => h.type === 'holiday');
    const day = Number(date.slice(8));
    const showMonth = day === 1 || (r === 0 && c === 0);
    return { date, info, isRest, monthLabel: showMonth ? `${Number(date.slice(5, 7))}월` : null };
  })), [grid, s]);

  return (
    <div className="calendar" style={{ '--cols': grid.columns, '--rows': grid.rows.length }}>
      <div className={`weekday-row ${showWeekCol ? 'with-week' : ''}`}>
        {showWeekCol && <div className="weekday week-col">주</div>}
        {grid.rows[0].map((date) => (
          <div key={date} className="weekday">
            {s.viewStyle === 'strip' ? `${names[weekday(date)]}` : names[weekday(date)]}
          </div>
        ))}
      </div>
      <div className={`grid ${showWeekCol ? 'with-week' : ''}`}>
        {rows.map((row, r) => (
          <div className="grid-row" key={grid.rows[r][0]}>
            {showWeekCol && (
              <div className="week-col cell-week">{weekNumber(grid.rows[r][0], Number(s.weekStart), Number(s.firstWeek))}</div>
            )}
            {row.map(({ date, info, isRest, monthLabel }) => (
              <DayCell
                key={date}
                date={date}
                today={today}
                s={s}
                info={info}
                isRest={isRest}
                monthLabel={monthLabel}
                inMonth={s.viewStyle !== 'month' || date.startsWith(anchorMonth)}
                items={sortDay(byDay.get(date) || [], s.doneToBottom)}
                editing={editingDate === date}
                highlight={highlightDate === date}
                dayBg={days[date] || ''}
                compact={compact}
                {...handlers}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
