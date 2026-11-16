import { useState } from 'react';
import { Modal } from './Modal.jsx';
import { Icon } from './Icon.jsx';
import { REPEAT_PRESETS } from '../lib/recurrence.js';

export const COLORS = ['', '#ef5350', '#ff9800', '#fdd835', '#66bb6a', '#26c6da', '#42a5f5', '#7e57c2', '#ec407a', '#8d6e63'];
const REMINDERS = [
  { value: '', label: '알림 없음' }, { value: 0, label: '정시' }, { value: 5, label: '5분 전' },
  { value: 10, label: '10분 전' }, { value: 15, label: '15분 전' }, { value: 30, label: '30분 전' },
  { value: 60, label: '1시간 전' }, { value: 120, label: '2시간 전' }, { value: 1440, label: '1일 전' },
];

export function EventDialog({ item, onSave, onDelete, onClose }) {
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
      title={isNew ? '새 일정' : '일정 편집'}
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
            <label className="check"><input type="checkbox" checked={f.allDay} onChange={set('allDay')} /> 종일</label>
            {!f.allDay && (
              <>
                <input type="time" className="input" value={f.startTime} onChange={set('startTime')} />
                <span>~</span>
                <input type="time" className="input" value={f.endTime} onChange={set('endTime')} />
              </>
            )}
          </div>
          <label>알림</label>
          <select className="select" value={String(f.reminder)} onChange={(e) => set('reminder')(e.target.value === '' ? '' : Number(e.target.value))}>
            {REMINDERS.map((r) => <option key={String(r.value)} value={String(r.value)}>{r.label}</option>)}
          </select>
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
