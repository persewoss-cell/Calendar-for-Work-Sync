import { useState } from 'react';
import { Modal } from './Modal.jsx';
import { Icon } from './Icon.jsx';
import { REPEAT_PRESETS } from '../lib/recurrence.js';
import { ALL_DAY_DAYS, joinAllDay, reminderLabel, splitAllDay, TIMED_REMINDERS } from '../lib/reminders.js';
import { addDays, diffDays } from '../lib/date.js';

export const COLORS = ['', '#ef5350', '#ff9800', '#fdd835', '#66bb6a', '#26c6da', '#42a5f5', '#7e57c2', '#ec407a', '#8d6e63'];

/** Timed items: "N분 전" choices (+ the current value if unusual). */
function timedOptions(current) {
  const opts = [{ value: '', label: '알림 없음' }, ...TIMED_REMINDERS];
  if (current !== '' && current != null && !TIMED_REMINDERS.some((o) => o.value === current)) {
    opts.push({ value: current, label: reminderLabel({ startTime: '00:00', reminder: current }) });
  }
  return opts;
}

/** All-day items: [시각] + [당일 / 전일 / 3일 전 / 일주일 전 / 직접 날짜 지정] (+ a date when custom). */
function AllDayReminder({ date, value, onChange }) {
  const has = value !== '' && value != null;
  const { daysBefore, time } = has ? splitAllDay(value) : { daysBefore: 0, time: '09:00' };
  const preset = ALL_DAY_DAYS.some((d) => d.value === daysBefore);
  const [custom, setCustom] = useState(has && !preset);
  const kind = !has ? '' : custom ? 'custom' : String(daysBefore);
  const customDate = addDays(date, -daysBefore);
  return (
    <div className="inline allday-remind">
      <select className="select" value={kind} aria-label="알림 날짜" onChange={(e) => {
        const v = e.target.value;
        if (v === '') { setCustom(false); onChange(''); return; }
        if (v === 'custom') { setCustom(true); onChange(joinAllDay(daysBefore, time)); return; }
        setCustom(false);
        onChange(joinAllDay(Number(v), time));
      }}>
        <option value="">알림 없음</option>
        {ALL_DAY_DAYS.map((d) => <option key={d.value} value={String(d.value)}>{d.label}</option>)}
        <option value="custom">직접 날짜 지정</option>
      </select>
      {kind === 'custom' && (
        <input type="date" className="input" value={customDate} max={date} aria-label="알림 날짜 지정"
          onChange={(e) => e.target.value && onChange(joinAllDay(diffDays(e.target.value, date), time))} />
      )}
      <input type="time" className="input" value={time} disabled={!has} aria-label="알림 시각"
        onChange={(e) => e.target.value && onChange(joinAllDay(daysBefore, e.target.value))} />
    </div>
  );
}

export function EventDialog({ item, onSave, onDelete, onClose, alarm = false }) {
  const isNew = !item._id;
  const [f, setF] = useState({
    title: item.title || '',
    memo: item.memo || '',
    date: item.date,
    endDate: item.endDate || item.date,
    allDay: !item.startTime,
    startTime: item.startTime || '09:00',
    endTime: item.endTime || '10:00',
    color: item.color || '',
    reminder: item.reminder ?? '',
    rrule: item.rrule || '',
    done: Boolean(item.done),
  });
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v?.target ? (v.target.type === 'checkbox' ? v.target.checked : v.target.value) : v }));
  const presetKnown = REPEAT_PRESETS.some((p) => p.value === f.rrule);

  const save = () => {
    const out = {
      title: f.title.trim() || '(제목 없음)',
      memo: f.memo,
      date: f.date,
      endDate: f.endDate < f.date ? f.date : f.endDate,
      startTime: f.allDay ? null : f.startTime,
      endTime: f.allDay ? null : f.endTime,
      color: f.color,
      reminder: f.reminder === '' ? null : Number(f.reminder),
      rrule: f.rrule,
    };
    if (!item.rrule) out.done = f.done;
    onSave(out);
  };

  return (
    <Modal
      title={alarm ? (isNew ? '새 알람' : '알람 편집') : (isNew ? '새 일정' : '일정 편집')}
      onClose={onClose}
      width={460}
      footer={(
        <>
          {!isNew && (
            item.rrule ? (
              <div className="foot-left">
                <button className="btn danger ghost" onClick={() => onDelete('occurrence')}>이 날짜만 삭제</button>
                <button className="btn danger ghost" onClick={() => onDelete('all')}>반복 전체 삭제</button>
              </div>
            ) : <button className="btn danger ghost foot-left" onClick={() => onDelete('all')}><Icon name="trash" size={14} /> 삭제</button>
          )}
          <button className="btn" onClick={onClose}>취소</button>
          <button className="btn primary" onClick={save}>저장</button>
        </>
      )}
    >
      <div className="form">
        <input className="input title-input" value={f.title} onChange={set('title')} placeholder="제목" autoFocus
          onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && save()} />
        <div className="form-grid">
          <label>시작일</label>
          <input type="date" className="input" value={f.date} onChange={set('date')} />
          <label>종료일</label>
          <input type="date" className="input" value={f.endDate} min={f.date} onChange={set('endDate')} />
          <label>시간</label>
          <div className="inline">
            <label className="check"><input type="checkbox" checked={f.allDay} onChange={(e) => {
              const allDay = e.target.checked;
              setF((p) => ({ ...p, allDay, reminder: p.reminder === '' ? '' : allDay ? -540 : 10 }));
            }} /> 종일</label>
            {!f.allDay && (
              <>
                <input type="time" className="input" value={f.startTime} onChange={set('startTime')} />
                <span>~</span>
                <input type="time" className="input" value={f.endTime} onChange={set('endTime')} />
              </>
            )}
          </div>
          <label>알림</label>
          {f.allDay ? (
            <AllDayReminder key={`${f.date}`} date={f.date} value={f.reminder} onChange={set('reminder')} />
          ) : (
            <select className="select" value={String(f.reminder)} onChange={(e) => set('reminder')(e.target.value === '' ? '' : Number(e.target.value))}>
              {timedOptions(f.reminder).map((r) => <option key={String(r.value)} value={String(r.value)}>{r.label}</option>)}
            </select>
          )}
          <label>반복</label>
          <div className="inline">
            <select className="select" value={presetKnown ? f.rrule : '__custom'} onChange={(e) => e.target.value !== '__custom' && set('rrule')(e.target.value)}>
              {REPEAT_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              {!presetKnown && <option value="__custom">사용자 지정</option>}
            </select>
            {!presetKnown && <input className="input mono" value={f.rrule} onChange={set('rrule')} title="RRULE" />}
          </div>
          <label>색상</label>
          <div className="color-row">
            {COLORS.map((c) => (
              <button key={c || 'none'} type="button" className={`color-dot ${f.color === c ? 'on' : ''}`}
                style={{ background: c || 'transparent' }} onClick={() => set('color')(c)} aria-label={c || '색 없음'}>
                {!c && <Icon name="x" size={10} />}
              </button>
            ))}
          </div>
          {!item.rrule && (
            <>
              <label>완료</label>
              <label className="check"><input type="checkbox" checked={f.done} onChange={set('done')} /> 완료한 일정</label>
            </>
          )}
        </div>
        <textarea className="input memo" rows={4} value={f.memo} onChange={set('memo')} placeholder="메모" />
      </div>
    </Modal>
  );
}
