import { useEffect, useState } from 'react';
import { Icon } from './Icon.jsx';
import { api } from '../lib/api.js';
import { addDays, parts, weekday, WEEKDAYS } from '../lib/date.js';
import { expandEvents } from '../lib/recurrence.js';
import { daysLeft, ddayText, nextOccurrence } from '../lib/dday.js';
import { reminderLabel } from '../lib/reminders.js';

const DDAY_COLORS = ['#4fc3f7', '#f06292', '#ffb74d', '#81c784', '#9575cd', '#90a4ae'];

function DdayForm({ initial, onSubmit, onCancel, submitLabel }) {
  const [f, setF] = useState(initial);
  const ok = f.title.trim() && /^\d{4}-\d{2}-\d{2}$/.test(f.date);
  return (
    <form className="dday-form" onSubmit={(e) => { e.preventDefault(); if (ok) onSubmit({ ...f, title: f.title.trim() }); }}>
      <input className="input" placeholder="이름 (예: 방학)" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus />
      <input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
      <div className="dday-form-row">
        <label className="check"><input type="checkbox" checked={f.repeatYearly} onChange={(e) => setF({ ...f, repeatYearly: e.target.checked })} /> 매년 반복</label>
        <span className="color-row">
          {DDAY_COLORS.map((c) => (
            <button type="button" key={c} className={`mini-dot ${f.color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setF({ ...f, color: c })} aria-label="색" />
          ))}
        </span>
      </div>
      <div className="dday-form-row end">
        {onCancel && <button type="button" className="btn small" onClick={onCancel}>취소</button>}
        <button type="submit" className="btn primary small" disabled={!ok}>{submitLabel}</button>
      </div>
    </form>
  );
}

/** D-day list: add, edit, delete, and switch "오늘 칸에 표시" (the eye) per item. */
export function DdayList({ countdowns, today, actions }) {
  const [editing, setEditing] = useState(null); // id | 'new' | null
  // Upcoming first (nearest on top), passed ones at the bottom (most recent first).
  const rank = (c) => { const n = daysLeft(c, today); return n >= 0 ? n : 100000 - n; };
  const sorted = [...countdowns].sort((a, b) => rank(a) - rank(b));
  return (
    <div className="dday-list">
      {sorted.length === 0 && editing !== 'new' && <p className="muted dday-empty">D-day가 없습니다. 아래에서 추가하세요.</p>}
      {sorted.map((c) => {
        const n = daysLeft(c, today);
        const shown = c.visible !== false;
        if (editing === c._id) {
          return (
            <DdayForm key={c._id} submitLabel="저장" initial={{ title: c.title, date: c.date, repeatYearly: Boolean(c.repeatYearly), color: c.color || DDAY_COLORS[0] }}
              onCancel={() => setEditing(null)} onSubmit={(v) => { actions.update(c._id, v); setEditing(null); }} />
          );
        }
        return (
          <div key={c._id} className={`dday-row ${n < 0 ? 'past' : ''}`}>
            <span className="dot" style={{ background: c.color || DDAY_COLORS[0] }} />
            <div className="dday-main">
              <strong>{c.title || 'D-day'}</strong>
              <small>{nextOccurrence(c, today)}{c.repeatYearly ? ' · 매년' : ''}</small>
            </div>
            <b className="dday-n">{ddayText(n)}</b>
            <button type="button" className={`icon-btn tiny dark ${shown ? 'on' : ''}`} onClick={() => actions.update(c._id, { visible: !shown })}
              title={shown ? '오늘 칸에 표시 중 (누르면 끄기)' : '오늘 칸에 표시 안 함 (누르면 켜기)'} aria-pressed={shown}>
              <Icon name={shown ? 'eye' : 'eyeOff'} size={15} />
            </button>
            <button type="button" className="icon-btn tiny dark" title="수정" onClick={() => setEditing(c._id)}><Icon name="settings" size={14} /></button>
            <button type="button" className="icon-btn tiny dark" title="삭제"
              onClick={() => window.confirm(`D-day 「${c.title}」을(를) 삭제할까요?`) && actions.remove(c._id)}><Icon name="trash" size={14} /></button>
          </div>
        );
      })}
      {editing === 'new' ? (
        <DdayForm submitLabel="추가" initial={{ title: '', date: addDays(today, 30), repeatYearly: false, color: DDAY_COLORS[0] }}
          onCancel={() => setEditing(null)} onSubmit={(v) => { actions.create({ ...v, visible: true }); setEditing(null); }} />
      ) : (
        <button type="button" className="btn small dday-add" onClick={() => setEditing('new')}><Icon name="plus" size={14} /> D-day 추가</button>
      )}
      <p className="dday-help"><Icon name="eye" size={12} /> 눈 아이콘이 켜진 D-day는 오늘 날짜 칸에 「D-45(방학)」처럼 표시되고, 날짜가 지나면 사라집니다.</p>
    </div>
  );
}

/** Upcoming items that have a reminder (next 90 days). */
export function RemindersList({ today, version, onOpen, onNew }) {
  const [list, setList] = useState(null);
  useEffect(() => {
    const to = addDays(today, 90);
    api.events(today, to)
      .then((events) => {
        const days = expandEvents(events.filter((e) => e.reminder != null), today, to);
        setList([...days.entries()].sort(([a], [b]) => a.localeCompare(b))
          .flatMap(([day, items]) => items.filter((i) => (!i.part || i.part[0] === 1) && !i.done).map((i) => ({ ...i, day }))));
      })
      .catch(() => setList([]));
  }, [today, version]);
  let lastDay = '';
  return (
    <div className="remind-list">
      {!list && <p className="muted">불러오는 중…</p>}
      {list && list.length === 0 && <p className="muted dday-empty">알림을 설정한 다가오는 일정이 없습니다.</p>}
      {list?.map((it) => {
        const head = it.day !== lastDay;
        lastDay = it.day;
        const [, m, d] = parts(it.day);
        return (
          <div key={it.key}>
            {head && <div className="remind-day">{m}월 {d}일 {WEEKDAYS.ko[weekday(it.day)]}{it.day === today ? ' · 오늘' : ''}</div>}
            <button type="button" className="remind-item" onClick={() => onOpen(it)}>
              <span className="remind-time">{it.startTime || '종일'}</span>
              <span className="grow">{it.title}</span>
              <span className="remind-when"><Icon name="bell" size={12} /> {reminderLabel(it)}</span>
            </button>
          </div>
        );
      })}
      {onNew && <button type="button" className="btn small dday-add" onClick={onNew}><Icon name="plus" size={14} /> 알림 일정 추가</button>}
    </div>
  );
}
