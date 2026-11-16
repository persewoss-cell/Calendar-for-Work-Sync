import { useRef, useState } from 'react';
import { Icon } from './Icon.jsx';
import { LineEditor } from './LineEditor.jsx';
import { diffDays, parts, todayIn, ymd } from '../lib/date.js';
import { fontCss, hexToRgba } from '../lib/settings.js';

const NOTE_COLORS = ['#fff59d', '#ffccbc', '#c8e6c9', '#bbdefb', '#e1bee7', '#f5f5f5'];
const CARD_COLORS = ['#4fc3f7', '#f06292', '#ffb74d', '#81c784', '#9575cd', '#90a4ae'];

export function StickyNote({ note, s, onChange, onDelete, onHide, dragHandleProps }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(note.title);
  const alpha = (100 - s.noteOpacity) / 100;
  const marker = (i) => (s.noteListStyle === 'number' ? `${i + 1}.` : s.noteListStyle === 'bullet' ? '•' : '');
  return (
    <div className="sticky" style={{
      background: hexToRgba(note.color, alpha), color: s.noteTextColor,
      fontFamily: fontCss(s.noteFontFamily), fontSize: s.noteFontSize, '--note-gap': `${s.noteLineSpacing * 2}px`,
    }}>
      <div className="card-head" {...dragHandleProps}>
        <input className="card-title" value={title} placeholder="메모" onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title !== note.title && onChange({ title })} />
        <div className="card-tools">
          {NOTE_COLORS.map((c) => (
            <button key={c} className="mini-dot" style={{ background: c }} onClick={() => onChange({ color: c })} aria-label="메모 색" />
          ))}
          <button className="icon-btn tiny" title="숨기기" onClick={onHide}><Icon name="eyeOff" size={13} /></button>
          <button className="icon-btn tiny" title="삭제" onClick={() => confirm('이 메모를 삭제할까요?') && onDelete()}><Icon name="trash" size={13} /></button>
        </div>
      </div>
      {editing ? (
        <LineEditor
          lines={note.items.map((it, i) => ({ key: `${i}`, text: it.text, done: it.done }))}
          placeholder="메모를 입력하세요"
          onCommit={(rows) => {
            setEditing(false);
            onChange({ items: rows.filter((r) => r.text.trim()).map((r) => ({ text: r.text.trim(), done: Boolean(r.done) })) });
          }}
        />
      ) : (
        <ul className="note-items" onClick={() => setEditing(true)}>
          {note.items.length === 0 && <li className="muted">눌러서 메모 작성</li>}
          {note.items.map((it, i) => (
            <li key={i} className={it.done ? 'done' : ''} style={{ background: s.noteTextBackground ? 'rgba(255,255,255,.35)' : undefined }}>
              {s.noteCheckbox && (
                <input type="checkbox" checked={it.done} onClick={(e) => e.stopPropagation()}
                  onChange={() => onChange({ items: note.items.map((x, j) => (j === i ? { ...x, done: !x.done } : x)) })} />
              )}
              {marker(i) && <span className="item-marker">{marker(i)}</span>}
              <span>{it.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function nextOccurrence(card, today) {
  if (!card.repeatYearly) return card.date;
  const [ty] = parts(today);
  const [, m, d] = parts(card.date);
  const thisYear = ymd(ty, m, d);
  return thisYear >= today ? thisYear : ymd(ty + 1, m, d);
}

export function CountdownCard({ card, s, onChange, onDelete, onHide, dragHandleProps }) {
  const [edit, setEdit] = useState(!card.title);
  const [f, setF] = useState({ title: card.title, date: card.date, repeatYearly: card.repeatYearly });
  const today = todayIn(s.timezone);
  const target = nextOccurrence(card, today);
  const n = diffDays(today, target);
  const label = n === 0 ? 'D-Day' : n > 0 ? `D-${n}` : `D+${-n}`;
  const alpha = (100 - s.countdownOpacity) / 100;
  return (
    <div className="countdown" style={{ background: `linear-gradient(135deg, ${hexToRgba(card.color, alpha)}, ${hexToRgba(card.color, alpha * 0.7)})` }}>
      <div className="card-head" {...dragHandleProps}>
        <span className="card-title">{card.title || 'D-day'}</span>
        <div className="card-tools">
          <button className="icon-btn tiny" title="편집" onClick={() => setEdit((v) => !v)}><Icon name="settings" size={13} /></button>
          <button className="icon-btn tiny" title="숨기기" onClick={onHide}><Icon name="eyeOff" size={13} /></button>
          <button className="icon-btn tiny" title="삭제" onClick={() => confirm('이 카드를 삭제할까요?') && onDelete()}><Icon name="trash" size={13} /></button>
        </div>
      </div>
      {edit ? (
        <div className="countdown-form">
          <input className="input" placeholder="이름 (예: 기말고사)" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          <label className="check"><input type="checkbox" checked={f.repeatYearly} onChange={(e) => setF({ ...f, repeatYearly: e.target.checked })} /> 매년 반복 (기념일)</label>
          <div className="color-row">
            {CARD_COLORS.map((c) => <button key={c} className={`mini-dot ${card.color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => onChange({ color: c })} aria-label="카드 색" />)}
          </div>
          <button className="btn primary small" onClick={() => { onChange(f); setEdit(false); }}>저장</button>
        </div>
      ) : (
        <div className="countdown-body">
          <div className="countdown-num">{label}</div>
          <div className="countdown-date">{target}{card.repeatYearly ? ' · 매년' : ''}</div>
        </div>
      )}
    </div>
  );
}

/** Floating cards over the calendar (browser / PWA). Positions are remembered per device. */
export function CardsLayer({ notes, countdowns, s, noteActions, countdownActions }) {
  const [pos, setPos] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cardPositions') || '{}'); } catch { return {}; }
  });
  const drag = useRef(null);
  const save = (next) => {
    setPos(next);
    try { localStorage.setItem('cardPositions', JSON.stringify(next)); } catch { /* storage unavailable */ }
  };
  const handle = (id, idx) => ({
    onPointerDown: (e) => {
      if (e.target.closest('button, input')) return;
      const p = pos[id] || defaultPos(idx);
      drag.current = { id, sx: e.clientX, sy: e.clientY, x: p.x, y: p.y };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e) => {
      const d = drag.current;
      if (!d || d.id !== id) return;
      setPos((cur) => ({ ...cur, [id]: { x: Math.max(0, d.x + e.clientX - d.sx), y: Math.max(0, d.y + e.clientY - d.sy) } }));
    },
    onPointerUp: () => {
      if (drag.current?.id === id) save({ ...pos });
      drag.current = null;
    },
    style: { cursor: 'move', touchAction: 'none' },
  });
  const defaultPos = (i) => ({ x: Math.max(8, window.innerWidth - 270 - Math.floor(i / 3) * 250), y: 90 + (i % 3) * 190 });

  const cards = [
    ...countdowns.filter((c) => c.visible).map((c) => ({ id: c._id, kind: 'countdown', data: c })),
    ...notes.filter((n) => n.visible).map((n) => ({ id: n._id, kind: 'note', data: n })),
  ];
  return (
    <div className="cards-layer">
      {cards.map((c, i) => {
        const p = pos[c.id] || defaultPos(i);
        return (
          <div key={c.id} className="floating-card" style={{ left: p.x, top: p.y }}>
            {c.kind === 'note' ? (
              <StickyNote note={c.data} s={s} dragHandleProps={handle(c.id, i)}
                onChange={(patch) => noteActions.update(c.id, patch)} onDelete={() => noteActions.remove(c.id)} onHide={() => noteActions.update(c.id, { visible: false })} />
            ) : (
              <CountdownCard card={c.data} s={s} dragHandleProps={handle(c.id, i)}
                onChange={(patch) => countdownActions.update(c.id, patch)} onDelete={() => countdownActions.remove(c.id)} onHide={() => countdownActions.update(c.id, { visible: false })} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** List of all cards, including hidden ones (mobile drawer + "노트 관리"). */
export function CardsList({ notes, countdowns, noteActions, countdownActions, s }) {
  const today = todayIn(s.timezone);
  return (
    <div className="cards-list">
      {countdowns.map((c) => {
        const n = diffDays(today, nextOccurrence(c, today));
        return (
          <div key={c._id} className="cards-list-row">
            <span className="dot" style={{ background: c.color }} />
            <span className="grow">{c.title || 'D-day'}</span>
            <b>{n === 0 ? 'D-Day' : n > 0 ? `D-${n}` : `D+${-n}`}</b>
            <button className="icon-btn tiny dark" onClick={() => countdownActions.update(c._id, { visible: !c.visible })}><Icon name={c.visible ? 'eye' : 'eyeOff'} size={14} /></button>
          </div>
        );
      })}
      {notes.map((n) => (
        <div key={n._id} className="cards-list-row">
          <span className="dot" style={{ background: n.color }} />
          <span className="grow">{n.title || n.items[0]?.text || '메모'}</span>
          <small className="muted">{n.items.length}줄</small>
          <button className="icon-btn tiny dark" onClick={() => noteActions.update(n._id, { visible: !n.visible })}><Icon name={n.visible ? 'eye' : 'eyeOff'} size={14} /></button>
        </div>
      ))}
    </div>
  );
}
