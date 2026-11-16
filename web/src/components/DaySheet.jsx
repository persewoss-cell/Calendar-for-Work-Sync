import { useState } from 'react';
import { Modal } from './Modal.jsx';
import { Icon } from './Icon.jsx';
import { holidaysOfYear } from '../lib/holidays.js';
import { solarTermsOfYear } from '../lib/solarTerms.js';
import { toLunar } from '../lib/lunar.js';
import { parts, weekday, WEEKDAYS } from '../lib/date.js';

/** Mobile: tapping a day opens this sheet instead of editing inside the small cell. */
export function DaySheet({ date, s, items, onClose, onAdd, onToggle, onOpen, onNew }) {
  const [text, setText] = useState('');
  const [y, m, d] = parts(date);
  const hol = (holidaysOfYear(y, s.holidayRegions, s.showObservances).get(date) || []).map((h) => h.name);
  const term = solarTermsOfYear(y).get(date);
  const lunar = toLunar(date);
  const add = () => {
    if (!text.trim()) return;
    onAdd(text.trim());
    setText('');
  };
  return (
    <Modal title={`${m}월 ${d}일 ${WEEKDAYS.ko[weekday(date)]}`} onClose={onClose} width={480} className="day-sheet">
      <div className="day-sheet-info">
        {[...hol, term, lunar && `음력 ${lunar.leap ? '윤' : ''}${lunar.month}월 ${lunar.day}일`].filter(Boolean).join(' · ')}
      </div>
      <ul className="day-sheet-list">
        {items.length === 0 && <li className="muted">일정이 없습니다.</li>}
        {items.map((it) => (
          <li key={it.key} className={it.done ? 'done' : ''}>
            <input type="checkbox" checked={it.done} onChange={() => onToggle(it)} aria-label="완료" />
            <button className="grow" onClick={() => onOpen(it)}>
              {it.startTime && <span className="item-time">{it.startTime}</span>}
              {it.color && <span className="dot" style={{ background: it.color }} />}
              {it.title}
            </button>
            {it.rrule && <Icon name="repeat" size={12} />}
          </li>
        ))}
      </ul>
      <div className="day-sheet-add">
        <input className="input" placeholder="할 일 입력 후 Enter" value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && add()} />
        <button className="btn primary" onClick={add}>추가</button>
        <button className="btn" onClick={onNew} title="시간·반복 등 자세히"><Icon name="more" /></button>
      </div>
    </Modal>
  );
}
