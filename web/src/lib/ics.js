import { addDays } from './date.js';

const esc = (s = '') => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const unesc = (s = '') => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
const compact = (d) => d.replaceAll('-', '');

export function toICS(events, tz = 'Asia/Seoul') {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Calendar for Work Sync//KO', 'CALSCALE:GREGORIAN'];
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e._id}@calendar-for-work-sync`, `DTSTAMP:${stamp}`);
    if (e.startTime) {
      lines.push(`DTSTART;TZID=${tz}:${compact(e.date)}T${e.startTime.replace(':', '')}00`);
      const end = e.endTime || e.startTime;
      lines.push(`DTEND;TZID=${tz}:${compact(e.endDate || e.date)}T${end.replace(':', '')}00`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${compact(e.date)}`, `DTEND;VALUE=DATE:${compact(addDays(e.endDate || e.date, 1))}`);
    }
    lines.push(`SUMMARY:${esc(e.title)}`);
    if (e.memo) lines.push(`DESCRIPTION:${esc(e.memo)}`);
    if (e.rrule) lines.push(`RRULE:${e.rrule}`);
    for (const x of e.exdates || []) lines.push(`EXDATE;VALUE=DATE:${compact(x)}`);
    if (e.done) lines.push('STATUS:COMPLETED');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

const toDate = (v) => `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
const toTime = (v) => (v.includes('T') ? `${v.slice(9, 11)}:${v.slice(11, 13)}` : null);

export function fromICS(text) {
  const raw = text.replace(/\r\n[ \t]/g, '').split(/\r?\n/);
  const out = [];
  let cur = null;
  for (const line of raw) {
    if (line === 'BEGIN:VEVENT') cur = { exdates: [] };
    else if (line === 'END:VEVENT' && cur) {
      if (cur.date) {
        if (cur.allDay && cur.endDate) cur.endDate = addDays(cur.endDate, -1);
        if (!cur.endDate || cur.endDate < cur.date) cur.endDate = cur.date;
        delete cur.allDay;
        out.push(cur);
      }
      cur = null;
    } else if (cur) {
      const idx = line.indexOf(':');
      if (idx < 0) continue;
      const key = line.slice(0, idx);
      const val = line.slice(idx + 1);
      const name = key.split(';')[0];
      if (name === 'SUMMARY') cur.title = unesc(val);
      else if (name === 'DESCRIPTION') cur.memo = unesc(val);
      else if (name === 'DTSTART') { cur.date = toDate(val); cur.startTime = toTime(val); cur.allDay = !cur.startTime; }
      else if (name === 'DTEND') { cur.endDate = toDate(val); cur.endTime = toTime(val); }
      else if (name === 'RRULE') cur.rrule = val;
      else if (name === 'EXDATE') val.split(',').forEach((v) => cur.exdates.push(toDate(v)));
      else if (name === 'STATUS' && val === 'COMPLETED') cur.done = true;
    }
  }
  return out;
}

export function toCSV(events) {
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const rows = [['날짜', '종료일', '시작', '종료', '제목', '메모', '완료', '반복'].map(q).join(',')];
  for (const e of events) {
    rows.push([e.date, e.endDate, e.startTime || '', e.endTime || '', e.title, e.memo, e.done ? 'Y' : '', e.rrule].map(q).join(','));
  }
  return '\uFEFF' + rows.join('\r\n');
}

export function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
