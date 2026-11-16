import { memo, useState } from 'react';
import { GoogleMark, Icon } from './Icon.jsx';
import { LineEditor } from './LineEditor.jsx';
import { hexToRgba } from '../lib/settings.js';

const REMINDER_LABEL = (min) => (min === 0 ? '정시' : min < 60 ? `${min}분 전` : min < 1440 ? `${min / 60}시간 전` : `${min / 1440}일 전`);

function ItemRow({ item, index, s, onToggle, onOpen, onDragStart }) {
  const marker = s.listStyle === 'number' ? `${index + 1}.` : s.listStyle === 'bullet' ? '•' : '';
  const textBg = s.textBackground === 'light' ? 'rgba(255,255,255,.22)' : s.textBackground === 'dark' ? 'rgba(0,0,0,.25)' : '';
  return (
    <li
      className={`item ${item.done ? 'done' : ''} ${item.syncState === 'error' ? 'sync-error' : ''}`}
      draggable={!item.rrule}
      onDragStart={(e) => onDragStart(e, item)}
      onDoubleClick={(e) => { e.stopPropagation(); onOpen(item); }}
      onClick={(e) => e.stopPropagation()}
      title={[item.title, item.memo].filter(Boolean).join('\n')}
      style={{ background: textBg || undefined, borderLeft: item.color ? `3px solid ${item.color}` : undefined }}
    >
      {s.showCheckbox && (
        <input type="checkbox" className="item-check" checked={item.done} onChange={() => onToggle(item)} aria-label="완료" />
      )}
      {marker && <span className="item-marker">{marker}</span>}
      <span className="item-text" onClick={() => onOpen(item)}>
        {item.startTime && <span className="item-time">{item.startTime}</span>}
        {item.title}
        {item.part && <span className="item-part"> ({item.part[0]}/{item.part[1]})</span>}
      </span>
      {item.done && s.showDoneIcon && <Icon name="check" size={12} className="done-icon" />}
      {s.showReminderTime && item.reminder != null && (
        <span className="item-reminder" title={`알림: ${REMINDER_LABEL(item.reminder)}`}><Icon name="bell" size={10} /></span>
      )}
      {item.rrule && <Icon name="repeat" size={10} className="item-flag" />}
      {item.googleSync && <span className="item-flag g" title={item.syncState === 'error' ? `구글 반영 실패: ${item.syncError}` : '구글 캘린더에 반영됨'}><GoogleMark size={9} /></span>}
    </li>
  );
}

function DayCellImpl({
  date, today, s, items, info, inMonth, isRest, editing, highlight, monthLabel, weekNo,
  onStartEdit, onCommit, onCancelEdit, onToggle, onOpen, onDropItem, compact,
}) {
  const [dragOver, setDragOver] = useState(false);
  const day = Number(date.slice(8));
  const isToday = date === today;
  const visible = s.showDone ? items : items.filter((i) => !i.done);
  const restColor = hexToRgba(s.holidayBgColor, 1);

  const classes = ['cell'];
  if (isToday) classes.push('today');
  if (isRest) classes.push('rest');
  if (!inMonth) classes.push('other-month');
  if (dragOver) classes.push('drag-over');
  if (highlight) classes.push('highlight');
  if (s.monthGap && day === 1) classes.push('month-start');
  if (s.monthGap && day <= 7) classes.push('month-top');

  return (
    <div
      className={classes.join(' ')}
      data-date={date}
      style={isRest ? { '--rest-bg': restColor } : undefined}
      onClick={() => !editing && onStartEdit(date)}
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
          <span key={h.name} className={`hol ${h.type}`} style={{ color: h.type === 'holiday' ? s.holidayTextColor : undefined }}>{h.name}</span>
        ))}
        {info.solarTerm && <span className="term" style={{ color: s.solarTermColor }}>{info.solarTerm}</span>}
        <span className="spacer" />
        {weekNo != null && <span className="week-no">{weekNo}주</span>}
        {info.lunar && <span className="lunar">{info.lunar}</span>}
      </div>
      {editing ? (
        <LineEditor
          lines={items.filter((i) => !i.part || i.part[0] === 1).map((i) => ({ key: i.key, text: i.title, item: i }))}
          onCommit={(rows) => onCommit(date, items, rows)}
          onCancel={onCancelEdit}
          style={{ fontFamily: 'var(--edit-font)', fontSize: 'var(--edit-size)', color: 'var(--edit-color)' }}
        />
      ) : (
        !s.hideTasks && (
          <ul className="items">
            {(compact ? visible.slice(0, 3) : visible).map((item, i) => (
              <ItemRow key={item.key} item={item} index={i} s={s} onToggle={onToggle} onOpen={onOpen}
                onDragStart={(e, it) => {
                  e.dataTransfer.setData('text/event-id', it._id);
                  e.dataTransfer.setData('text/from-date', it.day);
                }} />
            ))}
            {compact && visible.length > 3 && <li className="item more">+{visible.length - 3}</li>}
          </ul>
        )
      )}
    </div>
  );
}

export const DayCell = memo(DayCellImpl);
export { REMINDER_LABEL };
