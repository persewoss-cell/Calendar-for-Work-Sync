import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon.jsx';
import { CountdownCard, StickyNote } from './Cards.jsx';
import { api } from '../lib/api.js';
import { addDays, parts, weekday, WEEKDAYS } from '../lib/date.js';
import { expandEvents, sortDay } from '../lib/recurrence.js';
import { holidaysOfYear } from '../lib/holidays.js';
import { solarTermsOfYear } from '../lib/solarTerms.js';
import { hexToRgba } from '../lib/settings.js';
import { sanitizeHtml } from '../../../shared/sanitize.js';
import { REMINDER_LABEL } from './DayCell.jsx';

// White (or near-white) text set for the dark desktop calendar would vanish on the light phone screen.
const WHITE = /color:\s*(?:#fff\b|#ffffff\b|white\b|rgb\(\s*25[0-5],\s*25[0-5],\s*25[0-5]\s*\))/gi;
const forLightTheme = (html) => sanitizeHtml(html).replace(WHITE, 'color: #222').replace(/<font([^>]*) color="(?:#fff|#ffffff|white)"/gi, '<font$1');

function Empty({ kind, text }) {
  const art = {
    note: <path d="M44 34h32v40H44zM50 28v10M70 28v10M50 48h8v6h-8zM62 48h8v6h-8zM50 60h8v6h-8z" />,
    bell: <path d="M60 36a14 14 0 0 1 14 14v12l5 6H41l5-6V50a14 14 0 0 1 14-14zM55 74a5 5 0 0 0 10 0" />,
    timer: <path d="M60 80a22 22 0 1 0 0-44 22 22 0 0 0 0 44zM60 46v12l8 5M54 30h12" />,
  }[kind];
  return (
    <div className="m-empty">
      <svg viewBox="0 0 120 100" width="180" height="150" aria-hidden="true">
        <ellipse cx="60" cy="90" rx="46" ry="5" fill="#eef1f5" />
        <rect x="18" y="30" width="12" height="12" rx="2" fill="#e8f4fd" transform="rotate(-18 24 36)" />
        <rect x="88" y="26" width="14" height="10" rx="2" fill="#eef1f5" />
        <path d="M30 70l3 3-3 3-3-3z" fill="#bfe3fb" />
        <g fill="#cfeafc" stroke="#7cc8f4" strokeWidth="2.5" strokeLinejoin="round">{art}</g>
      </svg>
      <p>{text}</p>
    </div>
  );
}

function MonthView({ s, today, anchor, grid, byDay, days, onStep, onOpenDay }) {
  const [, am] = parts(anchor);
  const touch = useRef(null);
  const rows = grid.rows;
  const holidaysFor = (date) => {
    const [y] = parts(date);
    if (!s.showHolidays) return [];
    return (holidaysOfYear(y, s.holidayRegions, s.showObservances).get(date) || []);
  };
  return (
    <div
      className="m-month"
      onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
      onTouchEnd={(e) => {
        const t = touch.current;
        touch.current = null;
        if (!t) return;
        const dx = e.changedTouches[0].clientX - t.x;
        const dy = e.changedTouches[0].clientY - t.y;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) onStep(dx < 0 ? 1 : -1);
      }}
    >
      <div className="m-weekdays">
        {rows[0].map((d) => <div key={d} className={`wd-${weekday(d)}`}>{WEEKDAYS.koShort[weekday(d)]}</div>)}
      </div>
      {/* Each week is at least 1/rows of the screen, and grows when a day has many items. */}
      <div className="m-grid" style={{ gridAutoRows: `minmax(calc((100dvh - 190px - env(safe-area-inset-top) - env(safe-area-inset-bottom)) / ${rows.length}), auto)` }}>
        {rows.flat().map((date) => {
          const inMonth = Number(date.slice(5, 7)) === am;
          const hol = holidaysFor(date);
          const isHoliday = hol.some((h) => h.type === 'holiday');
          const term = s.showSolarTerms ? solarTermsOfYear(parts(date)[0]).get(date) : null;
          const items = sortDay(byDay.get(date) || [], s.doneToBottom).filter((i) => s.showDone || !i.done);
          const bg = days[date]?.bg;
          const wd = weekday(date);
          return (
            <button
              type="button"
              key={date}
              className={`m-day ${inMonth ? '' : 'out'} ${date === today ? 'today' : ''}`}
              style={bg ? { background: hexToRgba(bg, 0.35) } : undefined}
              onClick={() => onOpenDay(date)}
            >
              <span className={`m-num ${isHoliday || wd === 0 ? 'red' : wd === 6 ? 'blue' : ''}`}>{Number(date.slice(8))}</span>
              {(hol[0] || term) && <span className={`m-hol ${isHoliday ? 'red' : term && !hol[0] ? 'green' : ''}`}>{hol[0]?.name || term}</span>}
              {!s.hideTasks && items.map((it) => (
                <span key={it.key} className={`m-chip ${it.done ? 'done' : ''}`} style={it.color ? { boxShadow: `inset 3px 0 0 ${it.color}` } : undefined}>
                  {it.html ? <span dangerouslySetInnerHTML={{ __html: forLightTheme(it.html) }} /> : it.title}
                </span>
              ))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RemindersPage({ s, today, version, onOpen }) {
  const [list, setList] = useState(null);
  useEffect(() => {
    const to = addDays(today, 90);
    api.events(today, to)
      .then((events) => {
        const withReminder = events.filter((e) => e.reminder != null);
        const days = expandEvents(withReminder, today, to);
        setList([...days.entries()].sort(([a], [b]) => a.localeCompare(b))
          .flatMap(([day, items]) => items.filter((i) => !i.part || i.part[0] === 1).map((i) => ({ ...i, day }))));
      })
      .catch(() => setList([]));
  }, [today, version]);
  if (!list) return <div className="m-page-body muted">불러오는 중…</div>;
  if (!list.length) return <Empty kind="bell" text="알림 없음" />;
  let lastDay = '';
  return (
    <ul className="m-list">
      {list.map((it) => {
        const head = it.day !== lastDay ? it.day : null;
        lastDay = it.day;
        const [, m, d] = parts(it.day);
        return (
          <li key={it.key}>
            {head && <div className="m-list-day">{m}월 {d}일 {WEEKDAYS.ko[weekday(it.day)]}{it.day === today ? ' · 오늘' : ''}</div>}
            <button type="button" className="m-list-item" onClick={() => onOpen(it)}>
              <span className="m-time">{it.startTime || '종일'}</span>
              <span className="grow">{it.title}</span>
              <span className="m-remind"><Icon name="bell" size={13} /> {REMINDER_LABEL(it.reminder)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

const TABS = [
  { id: 'calendar', label: '달력', icon: 'calendar' },
  { id: 'notes', label: '메모', icon: 'note' },
  { id: 'reminders', label: '알림', icon: 'bell' },
  { id: 'countdowns', label: '카운트다운', icon: 'timer' },
  { id: 'me', label: '내 정보', icon: 'user' },
];

/** Phone layout: light theme, month grid with item chips, bottom tabs. */
export function MobileShell({
  me, s, today, anchor, grid, byDay, days, version, notes, countdowns, noteActions, countdownActions,
  onStep, onToday, onOpenDay, onNewEvent, onOpenEvent, actions, online,
}) {
  const [tab, setTab] = useState(() => {
    try { return sessionStorage.getItem('mobileTab') || 'calendar'; } catch { return 'calendar'; }
  });
  const [menu, setMenu] = useState(false);
  const pick = (t) => {
    setTab(t);
    try { sessionStorage.setItem('mobileTab', t); } catch { /* ignore */ }
  };
  const [y, m] = parts(anchor);
  const ordered = useMemo(() => [...notes].reverse(), [notes]);

  const fab = {
    calendar: () => onNewEvent(),
    notes: noteActions.create,
    reminders: () => onNewEvent({ reminder: 10, startTime: '09:00' }),
    countdowns: countdownActions.create,
  }[tab];

  return (
    <div className="mobile">
      <header className="m-head">
        {tab === 'calendar' ? (
          <button type="button" className="m-title" onClick={actions.openDate}>{y}년 {m}월 <span className="m-caret">▾</span></button>
        ) : (
          <span className="m-title center">{TABS.find((t) => t.id === tab).label}</span>
        )}
        {tab === 'calendar' && (
          <div className="m-head-actions">
            <button type="button" aria-label="이전 달" onClick={() => onStep(-1)}><Icon name="left" size={20} /></button>
            <button type="button" className="m-today" onClick={onToday}>오늘</button>
            <button type="button" aria-label="다음 달" onClick={() => onStep(1)}><Icon name="right" size={20} /></button>
            <button type="button" aria-label="메뉴" onClick={() => setMenu((v) => !v)}><Icon name="menu" size={24} /></button>
            {menu && (
              <div className="menu m-menu" onClick={() => setMenu(false)}>
                <button className="menu-item" onClick={actions.openSearch}><span className="menu-label">내용 검색</span></button>
                <button className="menu-item" onClick={actions.openDate}><span className="menu-label">날짜 선택</span></button>
                <button className="menu-item" onClick={actions.toggleTasks}><span className="menu-label">{s.hideTasks ? '예약된 작업 보이기' : '예약된 작업 숨기기'}</span></button>
                <button className="menu-item" onClick={actions.openImport}><span className="menu-label">불러오기</span></button>
                <button className="menu-item" onClick={actions.openExport}><span className="menu-label">내보내기</span></button>
                <button className="menu-item" onClick={actions.openSettings}><span className="menu-label">캘린더 설정</span></button>
              </div>
            )}
          </div>
        )}
      </header>
      {!online && <div className="m-offline">서버에 연결할 수 없습니다. 다시 연결 중…</div>}

      <main className="m-body">
        {tab === 'calendar' && (
          <MonthView s={s} today={today} anchor={anchor} grid={grid} byDay={byDay} days={days}
            onStep={onStep} onOpenDay={onOpenDay} />
        )}
        {tab === 'notes' && (ordered.length ? (
          <div className="m-cards">
            {ordered.map((n) => (
              <StickyNote key={n._id} note={n} s={s} onChange={(p) => noteActions.update(n._id, p)}
                onDelete={() => noteActions.remove(n._id)} onHide={() => noteActions.update(n._id, { visible: !n.visible })} />
            ))}
          </div>
        ) : <Empty kind="note" text="메모 없음" />)}
        {tab === 'reminders' && <RemindersPage s={s} today={today} version={version} onOpen={onOpenEvent} />}
        {tab === 'countdowns' && (countdowns.length ? (
          <div className="m-cards">
            {countdowns.map((c) => (
              <CountdownCard key={c._id} card={c} s={s} onChange={(p) => countdownActions.update(c._id, p)}
                onDelete={() => countdownActions.remove(c._id)} onHide={() => countdownActions.update(c._id, { visible: !c.visible })} />
            ))}
          </div>
        ) : <Empty kind="timer" text="카운트다운 일 없음" />)}
        {tab === 'me' && (
          <div className="m-me">
            <div className="m-profile">
              <span className="m-avatar"><Icon name="user" size={30} /></span>
              <div><strong>{me.name || me.username}</strong><small>아이디: {me.username}</small></div>
            </div>
            <div className="m-group">
              <button type="button" onClick={actions.openAccount}><Icon name="account" /> 계정 설정 <span>›</span></button>
            </div>
            <div className="m-group m-quick">
              <button type="button" onClick={actions.openSettings}><span className="q q1"><Icon name="settings" /></span>캘린더 설정</button>
              <button type="button" onClick={actions.openSearch}><span className="q q2"><Icon name="search" /></span>검색</button>
              <button type="button" onClick={actions.openHelp}><span className="q q3"><Icon name="bulb" /></span>기능 소개</button>
              <button type="button" onClick={actions.openMobile}><span className="q q4"><Icon name="phone" /></span>기기 연결</button>
            </div>
            <div className="m-group">
              <button type="button" onClick={actions.openImport}><Icon name="upload" /> 불러오기 (엑셀·백업) <span>›</span></button>
              <button type="button" onClick={actions.openExport}><Icon name="download" /> 내보내기 <span>›</span></button>
              <button type="button" onClick={actions.logout}><Icon name="logout" /> 로그아웃 <span>›</span></button>
            </div>
          </div>
        )}
      </main>

      {fab && (
        <button type="button" className="m-fab" onClick={fab} aria-label="추가"><Icon name="plus" size={28} stroke={2.4} /></button>
      )}

      <nav className="m-tabs">
        {TABS.map((t) => (
          <button type="button" key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => pick(t.id)}>
            <Icon name={t.icon} size={24} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
