import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon.jsx';
import { desktop, isDesktop } from '../lib/desktop.js';
import { WEEKDAYS, parts, weekday } from '../lib/date.js';
import { DdayList, RemindersList } from './Panels.jsx';

function useOutside(open, close) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => ref.current && !ref.current.contains(e.target) && close();
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open, close]);
  return ref;
}

function Dropdown({ icon, title, children, badge, color, panel }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const ref = useOutside(open, close);
  useEffect(() => {
    if (!open) return undefined;
    // Clicking another program or the desktop takes focus from the window: close the popup.
    // (Not for a moment-long blur such as a confirm box, nor while a date/time picker is open.)
    const onBlur = () => setTimeout(() => {
      const a = document.activeElement;
      if (a && ref.current?.contains(a) && /^(date|time)$/.test(a.type)) return;
      if (!document.hasFocus()) setOpen(false);
    }, 150);
    window.addEventListener('blur', onBlur);
    // Desktop app: the window lost focus at the OS level (more reliable than the page's own blur).
    const offDesktop = desktop?.onWindowBlur?.(() => {
      const a = document.activeElement;
      if (a && ref.current?.contains(a) && /^(date|time)$/.test(a.type)) return;
      setOpen(false);
    });
    return () => { window.removeEventListener('blur', onBlur); offDesktop?.(); };
  }, [open, ref]);
  return (
    <div className="dropdown" ref={ref}>
      <button className={`icon-btn ${open ? 'pressed' : ''}`} style={{ color }} title={title} aria-label={title} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name={icon} size={19} />{badge && <span className="badge-dot" />}
      </button>
      {open && (panel
        // A panel stays open while it is used; it closes on an outside click.
        ? <div className="menu panel" role="dialog" aria-label={title}><div className="panel-title">{title}</div>{typeof children === 'function' ? children(close) : children}</div>
        : <div className="menu" onClick={close}>{children}</div>)}
    </div>
  );
}

/** Centre title: the year and the month are buttons; each opens a small picker that jumps there at once. */
function MonthTitle({ y, m, lang, onPick }) {
  const [open, setOpen] = useState(null); // 'year' | 'month' | null
  const [base, setBase] = useState(y); // first year of the 12 shown in the year picker
  const close = () => setOpen(null);
  const ref = useOutside(Boolean(open), close);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    const offDesktop = desktop?.onWindowBlur?.(close);
    return () => { window.removeEventListener('keydown', onKey); offDesktop?.(); };
  }, [open]);
  const toggle = (which) => { setBase(y - 5); setOpen((o) => (o === which ? null : which)); };
  const pick = (yy, mm) => { close(); onPick(yy, mm); };
  const en = lang === 'en';
  const monthName = (mm) => (en ? new Date(2000, mm - 1, 1).toLocaleString('en', { month: 'short' }) : `${mm}월`);
  return (
    <span className="ym" ref={ref}>
      <button type="button" className={`ym-btn ${open === 'year' ? 'on' : ''}`} onClick={() => toggle('year')} title="연도 선택" aria-expanded={open === 'year'}>
        {en ? y : `${y}년`}
      </button>
      <button type="button" className={`ym-btn ${open === 'month' ? 'on' : ''}`} onClick={() => toggle('month')} title="월 선택" aria-expanded={open === 'month'}>
        {en ? new Date(2000, m - 1, 1).toLocaleString('en', { month: 'long' }) : `${m}월`}
      </button>
      {open === 'year' && (
        <div className="ym-pop" role="dialog" aria-label="연도 선택">
          <div className="ym-pop-head">
            <button type="button" className="ym-nav" onClick={() => setBase(base - 12)} aria-label="이전 연도들"><Icon name="left" size={16} /></button>
            <span>{base} – {base + 11}</span>
            <button type="button" className="ym-nav" onClick={() => setBase(base + 12)} aria-label="다음 연도들"><Icon name="right" size={16} /></button>
          </div>
          <div className="ym-grid">
            {Array.from({ length: 12 }, (_, i) => base + i).map((yy) => (
              <button type="button" key={yy} className={`ym-cell ${yy === y ? 'cur' : ''}`} onClick={() => pick(yy, m)}>{yy}</button>
            ))}
          </div>
        </div>
      )}
      {open === 'month' && (
        <div className="ym-pop" role="dialog" aria-label="월 선택">
          <div className="ym-pop-head"><span>{en ? y : `${y}년`}</span></div>
          <div className="ym-grid">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((mm) => (
              <button type="button" key={mm} className={`ym-cell ${mm === m ? 'cur' : ''}`} onClick={() => pick(y, mm)}>{monthName(mm)}</button>
            ))}
          </div>
        </div>
      )}
    </span>
  );
}

const Item = ({ icon, children, onClick, right, disabled }) => (
  <button className="menu-item" onClick={onClick} disabled={disabled}>
    <span className="menu-icon">{icon && <Icon name={icon} size={16} />}</span>
    <span className="menu-label">{children}</span>
    {right && <span className="menu-right">{right}</span>}
  </button>
);

export function Toolbar({ s, today, anchor, actions, countdowns, ddayActions, version, syncing }) {
  const [y, m, d] = parts(today);
  const wd = (s.language === 'en' ? WEEKDAYS.en : WEEKDAYS.ko)[weekday(today)];
  const todayText = s.language === 'en' ? `Today is ${wd}, ${today}` : `오늘은 ${y}년 ${m}월 ${d}일 ${wd}`;
  const [ay, am] = parts(anchor);
  const away = s.viewStyle === 'month' ? anchor.slice(0, 7) !== today.slice(0, 7) : false;
  const color = s.titleButtonColor;

  return (
    <header className={`toolbar ${s.showTitleBar ? '' : 'autohide'}`} title="제목 줄을 더블클릭하면 접힙니다"
      onDoubleClick={(e) => { if (!e.target.closest('button, .menu')) actions.collapse(); }}>
      <div className="tb-left">
        <button className="icon-btn" style={{ color: s.titleButtonColor }} title="접기 (제목 줄 더블클릭)" aria-label="캘린더 접기" onClick={actions.collapse}>
          <Icon name="collapse" size={16} />
        </button>
        <span className="today-chip">{todayText}</span>
      </div>
      <div className="tb-center">
        <span className="tb-title">
          <MonthTitle y={ay} m={am} lang={s.language} onPick={(yy, mm) => actions.goMonth(yy, mm)} />
        </span>
        {away && (
          <button type="button" className="today-btn" onClick={actions.goToday} title="이번 달로 이동">
            {s.language === 'en' ? 'Today' : '오늘로'}
          </button>
        )}
      </div>
      <div className="tb-right" style={{ color }}>
        <button className="icon-btn" style={{ color }} title="내용 검색" aria-label="검색" onClick={actions.openSearch}>
          <Icon name="search" size={18} />
        </button>
        <button className={`icon-btn sync-btn ${syncing ? 'syncing' : ''}`} style={{ color }} aria-label="동기화"
          title={syncing ? '서버와 동기화하는 중…' : '눌러서 서버와 다시 동기화'} onClick={actions.sync}>
          <Icon name="sync" size={18} className={syncing ? 'spin' : ''} />
        </button>
        <Dropdown icon="bell" title="알림" color={color} panel>
          {(close) => (
            <RemindersList today={today} version={version}
              onOpen={(it) => { close(); actions.openEvent(it); }}
              onNew={() => { close(); actions.newReminder(); }}
              onRemove={actions.removeReminder} />
          )}
        </Dropdown>
        <Dropdown icon="timer" title="D-day" color={color} panel>
          <DdayList countdowns={countdowns} today={today} actions={ddayActions} />
        </Dropdown>
        <button className="icon-btn" style={{ color }} title="계정 설정" aria-label="계정 설정" onClick={actions.openAccount}>
          <Icon name="user" size={19} />
        </button>
        <button className="icon-btn" style={{ color }} title="캘린더 설정" aria-label="캘린더 설정" onClick={actions.openSettings}><Icon name="settings" size={19} /></button>
        <button className="icon-btn" style={{ color }} title="이전" aria-label="이전" onClick={() => actions.step(-1)}><Icon name="left" size={19} /></button>
        <button className="icon-btn" style={{ color }} title="다음" aria-label="다음" onClick={() => actions.step(1)}><Icon name="right" size={19} /></button>
        <Dropdown icon="menu" title="메뉴" color={color}>
          <Item icon="search" onClick={actions.openSearch}>내용 검색</Item>
          <Item onClick={actions.openDate}>날짜 선택</Item>
          <hr />
          {isDesktop && <Item icon="move" onClick={actions.moveResize}>위치 및 크기</Item>}
          {isDesktop && <Item onClick={actions.hideCalendar}>캘린더 숨기기</Item>}
          <Item onClick={actions.toggleTasks} right={<Icon name={s.hideTasks ? 'lock' : 'unlock'} size={14} />}>
            {s.hideTasks ? '예약된 작업 보이기' : '예약된 작업 숨기기'}
          </Item>
          <Item onClick={actions.openExport}>내보내기</Item>
          <Item onClick={actions.openImport}>불러오기</Item>
          <Item onClick={() => window.print()}>프린트</Item>
          <hr />
          <Item icon="settings" onClick={actions.openSettings}>캘린더 설정</Item>
          <Item icon="account" onClick={actions.openAccount}>계정 설정</Item>
          <hr />
          <Item icon="phone" onClick={actions.openMobile}>휴대폰 연결 (QR)</Item>
          <Item icon="bulb" onClick={actions.openHelp}>기능 소개</Item>
          <Item onClick={actions.openAbout}>제품 정보</Item>
          <hr />
          {isDesktop ? <Item icon="power" onClick={actions.quit}>소프트웨어 종료</Item> : <Item icon="logout" onClick={actions.logout}>로그아웃</Item>}
        </Dropdown>
      </div>
    </header>
  );
}
