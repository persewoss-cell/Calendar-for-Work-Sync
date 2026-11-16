import { memo, useState } from 'react';
import { Icon } from './Icon.jsx';
import { hexToRgba } from '../lib/settings.js';
import { daysInMonth, parts, weekday } from '../lib/date.js';
import { sanitizeHtml } from '../../../shared/sanitize.js';

const REMINDER_LABEL = (min) => (min === 0 ? '정시' : min < 60 ? `${min}분 전` : min < 1440 ? `${min / 60}시간 전` : `${min / 1440}일 전`);

function ItemRow({ item, index, s, listStyle, onToggle, onDragStart }) {
  const marker = listStyle === 'number' ? `${index + 1}.` : listStyle === 'bullet' ? '•' : '';
  const textBg = s.textBackground === 'light' ? 'rgba(255,255,255,.22)' : s.textBackground === 'dark' ? 'rgba(0,0,0,.25)' : '';
  return (
    <li
      className={`item ${item.done ? 'done' : ''}`}
      draggable={!item.rrule}
      onDragStart={(e) => onDragStart(e, item)}
      title={[item.title, item.memo].filter(Boolean).join('\n')}
      style={{ background: textBg || undefined, borderLeft: item.color ? `3px solid ${item.color}` : undefined }}
    >
      {s.showCheckbox && (
        <input type="checkbox" className="item-check" checked={item.done} onChange={() => onToggle(item)}
          onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} aria-label="완료" />
      )}
      {marker && <span className="item-marker">{marker}</span>}
      <span className="item-text">
        {item.startTime && <span className="item-time">{item.startTime}</span>}
        {item.html
          ? <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(item.html) }} />
          : item.title}
        {item.part && <span className="item-part"> ({item.part[0]}/{item.part[1]})</span>}
      </span>
      {item.done && s.showDoneIcon && <Icon name="check" size={12} className="done-icon" />}
      {s.showReminderTime && item.reminder != null && (
        <span className="item-reminder" title={`알림: ${REMINDER_LABEL(item.reminder)}`}><Icon name="bell" size={10} /></span>
      )}
      {item.rrule && <Icon name="repeat" size={10} className="item-flag" />}
    </li>
  );
}

function DayCellImpl({
  date, today, s, items, info, inMonth, restKind, editing, highlight, monthLabel, weekNo, dayBg, dayList,
  onOpenEditor, onToggle, onDropItem, compact,
}) {
  const [dragOver, setDragOver] = useState(false);
  const day = Number(date.slice(8));
  const isToday = date === today;
  const visible = s.showDone ? items : items.filter((i) => !i.done);

  const classes = ['cell'];
  if (isToday) classes.push('today');
  if (restKind) classes.push('rest', `rest-${restKind}`);
  if (dayBg) classes.push('colored');
  if (!inMonth) classes.push('other-month');
  if (dragOver) classes.push('drag-over');
  if (highlight) classes.push('highlight');
  if (editing) classes.push('editing');
  // 월 간격: draw the sides of this cell that face another month, so each month gets an outline.
  const style = {};
  if (dayBg) style.backgroundColor = hexToRgba(dayBg, 0.72);
  if (s.monthGap) {
    const [y, m] = parts(date);
    const last = daysInMonth(y, m);
    const w = '2px';
    if (day <= 7) style['--edge-t'] = w;
    if (day > last - 7) style['--edge-b'] = w;
    // Left/right: where the neighbouring day is another month, and on the grid's outer columns.
    const col = s.viewStyle === 'strip' ? -1 : (weekday(date) - (Number(s.weekStart) || 0) + 7) % 7;
    if (day === 1 || col === 0) style['--edge-l'] = w;
    if (day === last || col === 6) style['--edge-r'] = w;
    if (Object.keys(style).some((k) => k.startsWith('--edge'))) classes.push('month-edge');
  }

  const open = (e) => onOpenEditor(date, e.currentTarget.getBoundingClientRect());

  return (
    <div
      className={classes.join(' ')}
      data-date={date}
      style={style}
      onDoubleClick={compact ? undefined : open}
      onClick={compact ? open : undefined}
      title={compact ? undefined : '더블클릭해서 입력'}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const id = e.dataTransfer.getData('text/event-id');
        const from = e.dataTransfer.getData('text/from-date');
        if (id && from !== date) onDropItem(id, from, date);
      }}
    >
      {monthLabel && <div className="month-label">{monthLabel}</div>}
      <div className="cell-head">
        {!monthLabel && <span className="day-num">{day}</span>}
        {info.holidays.map((h) => (
          <span key={h.name} className={`hol ${h.type}`}>{h.name}</span>
        ))}
        {info.solarTerm && <span className="term">{info.solarTerm}</span>}
        <span className="spacer" />
        {weekNo != null && <span className="week-no">{weekNo}주</span>}
        {info.lunar && <span className="lunar">{info.lunar}</span>}
      </div>
      {!s.hideTasks && (
        <ul className="items">
          {(compact ? visible.slice(0, 3) : visible).map((item, i) => (
            <ItemRow key={item.key} item={item} index={i} s={s} listStyle={dayList || s.listStyle} onToggle={onToggle}
              onDragStart={(e, it) => {
                e.dataTransfer.setData('text/event-id', it._id);
                e.dataTransfer.setData('text/from-date', it.day);
              }} />
          ))}
          {compact && visible.length > 3 && <li className="item more">+{visible.length - 3}</li>}
        </ul>
      )}
    </div>
  );
}

export const DayCell = memo(DayCellImpl);
export { REMINDER_LABEL };
