import { useMemo, useRef, useState } from 'react';
import { Icon } from './Icon.jsx';
import { DdayList, RemindersList } from './Panels.jsx';
import { parts, weekday, WEEKDAYS } from '../lib/date.js';
import { sortDay } from '../lib/recurrence.js';
import { ddayText, targetsInRange, todayCounters } from '../lib/dday.js';
import { holidaysOfYear } from '../lib/holidays.js';
import { solarTermsOfYear } from '../lib/solarTerms.js';
import { hexToRgba } from '../lib/settings.js';
import { sanitizeHtml } from '../../../shared/sanitize.js';

// White (or near-white) text set for the dark desktop calendar would vanish on the light phone screen.
const WHITE = /color:\s*(?:#fff\b|#ffffff\b|white\b|rgb\(\s*25[0-5],\s*25[0-5],\s*25[0-5]\s*\))/gi;
const forLightTheme = (html) => sanitizeHtml(html).replace(WHITE, 'color: #222').replace(/<font([^>]*) color="(?:#fff|#ffffff|white)"/gi, '<font$1');

function MonthView({ s, today, anchor, grid, byDay, days, countdowns, onStep, onOpenDay }) {
  const [, am] = parts(anchor);
  const touch = useRef(null);
  const rows = grid.rows;
  const targets = useMemo(() => targetsInRange(countdowns, grid.from, grid.to), [countdowns, grid.from, grid.to]);
  const counters = useMemo(() => todayCounters(countdowns, today), [countdowns, today]);
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
              className={`m-day ${inMonth ? '' : 'out'} ${date === today ? 'today' : ''} ${isHoliday || wd === 0 ? 'sun' : wd === 6 ? 'sat' : ''}`}
              style={bg ? { background: hexToRgba(bg, 0.35) } : undefined}
              onClick={() => onOpenDay(date)}
            >
              <span className={`m-num ${isHoliday || wd === 0 ? 'red' : wd === 6 ? 'blue' : ''}`}>{Number(date.slice(8))}</span>
              {(hol[0] || term) && <span className={`m-hol ${isHoliday ? 'red' : term && !hol[0] ? 'green' : ''}`}>{hol[0]?.name || term}</span>}
              {targets.get(date)?.map((c) => <span key={c._id} className="m-hol dday">D-day {c.title}</span>)}
              {date === today && counters.map((c) => (
                <span key={c._id} className="m-chip dday" style={{ boxShadow: `inset 3px 0 0 ${c.color || '#4fc3f7'}` }}>{ddayText(c.n)}({c.title})</span>
              ))}
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

const TABS = [
  { id: 'calendar', label: '달력', icon: 'calendar' },
  { id: 'reminders', label: '알림', icon: 'bell' },
  { id: 'countdowns', label: 'D-day', icon: 'timer' },
  { id: 'me', label: '내 정보', icon: 'user' },
];

/** Phone layout: light theme, month grid with item chips, bottom tabs. */
export function MobileShell({
  me, s, today, anchor, grid, byDay, days, version, countdowns, countdownActions,
  onStep, onToday, onOpenDay, onNewEvent, onOpenEvent, actions, syncing,
}) {
  const [tab, setTab] = useState(() => {
    let t = 'calendar';
    try { t = sessionStorage.getItem('mobileTab') || 'calendar'; } catch { /* ignore */ }
    return TABS.some((x) => x.id === t) ? t : 'calendar';
  });
  const [menu, setMenu] = useState(false);
  const pick = (t) => {
    setTab(t);
    try { sessionStorage.setItem('mobileTab', t); } catch { /* ignore */ }
  };
  const [y, m] = parts(anchor);

  const fab = {
    calendar: () => onNewEvent(),
    reminders: () => onNewEvent({ reminder: 10, startTime: '09:00' }),
  }[tab];

  return (
    <div className="mobile">
      <header className="m-head">
        {tab === 'calendar' ? (
          <button type="button" className="m-title" onClick={actions.openDate}>{y}년 {m}월 <span className="m-caret">▾</span></button>
        ) : (
          <>
            <span className="m-title center">{TABS.find((t) => t.id === tab).label}</span>
            <button type="button" className="m-sync-corner" aria-label="동기화" onClick={actions.sync}><Icon name="sync" size={20} className={syncing ? 'spin' : ''} /></button>
          </>
        )}
        {tab === 'calendar' && (
          <div className="m-head-actions">
            <button type="button" aria-label="이전 달" onClick={() => onStep(-1)}><Icon name="left" size={20} /></button>
            <button type="button" className="m-today" onClick={onToday}>오늘</button>
            <button type="button" aria-label="다음 달" onClick={() => onStep(1)}><Icon name="right" size={20} /></button>
            <button type="button" aria-label="동기화" onClick={actions.sync}><Icon name="sync" size={20} className={syncing ? 'spin' : ''} /></button>
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

      <main className="m-body">
        {tab === 'calendar' && (
          <MonthView s={s} today={today} anchor={anchor} grid={grid} byDay={byDay} days={days} countdowns={countdowns}
            onStep={onStep} onOpenDay={onOpenDay} />
        )}
        {tab === 'reminders' && (
          <div className="m-panel"><RemindersList today={today} version={version} onOpen={onOpenEvent} onRemove={actions.removeReminder} /></div>
        )}
        {tab === 'countdowns' && (
          <div className="m-panel"><DdayList countdowns={countdowns} today={today} actions={countdownActions} /></div>
        )}
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
