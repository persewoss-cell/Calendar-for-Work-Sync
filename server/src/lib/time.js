export const DEFAULT_TZ = 'Asia/Seoul';

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** Date + time ("YYYY-MM-DD", "HH:mm") as seen in timezone tz. */
export function tzParts(date, tz = DEFAULT_TZ) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

export function addMinutes(date, time, minutes) {
  const [h, m] = time.split(':').map(Number);
  let total = h * 60 + m + minutes;
  let day = date;
  while (total >= 1440) { total -= 1440; day = addDays(day, 1); }
  while (total < 0) { total += 1440; day = addDays(day, -1); }
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return { date: day, time: `${hh}:${mm}` };
}

export const compact = (dateStr) => dateStr.replaceAll('-', '');
