import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon.jsx';
import { isDesktop } from '../lib/desktop.js';
import { WEEKDAYS, parts, weekday } from '../lib/date.js';

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

function Dropdown({ icon, title, children, badge, color }) {
  const [open, setOpen] = useState(false);
  const ref = useOutside(open, () => setOpen(false));
  return (
    <div className="dropdown" ref={ref}>
      <button className="icon-btn" style={{ color }} title={title} aria-label={title} onClick={() => setOpen((o) => !o)}>
        <Icon name={icon} size={19} />{badge && <span className="badge-dot" />}
      </button>
      {open && <div className="menu" onClick={() => setOpen(false)}>{children}</div>}
    </div>
  );
}

const Item = ({ icon, children, onClick, right, disabled }) => (
  <button className="menu-item" onClick={onClick} disabled={disabled}>
    <span className="menu-icon">{icon && <Icon name={icon} size={16} />}</span>
    <span className="menu-label">{children}</span>
    {right && <span className="menu-right">{right}</span>}
  </button>
);

export function Toolbar({ s, today, anchor, actions }) {
  const [y, m, d] = parts(today);
  const wd = (s.language === 'en' ? WEEKDAYS.en : WEEKDAYS.ko)[weekday(today)];
  const title = s.language === 'en' ? `Today is ${wd}, ${today}` : `오늘은 ${y}년${m}월${d}일 ${wd}`;
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
        {s.viewStyle === 'month' && (
          <button className={`month-chip ${away ? 'away' : ''}`} onClick={actions.goToday} title="오늘로 이동">
            {ay}년 {am}월{away && <small> · 오늘로</small>}
          </button>
        )}
      </div>
      <button className="tb-title" onClick={actions.goToday} title="오늘로 이동">{title}</button>
      <div className="tb-right" style={{ color }}>
        <Dropdown icon="puzzle" title="메모 · D-day" color={color}>
          <Item icon="note" onClick={actions.newNote}>새 스티커 메모</Item>
          <Item icon="timer" onClick={actions.newCountdown}>새 D-day 카드</Item>
          <Item icon={s.showNotes ? 'eyeOff' : 'eye'} onClick={actions.toggleNotes}>{s.showNotes ? '메모·카드 숨기기' : '메모·카드 보이기'}</Item>
        </Dropdown>
        <button className="icon-btn" style={{ color }} title="모바일 연결" aria-label="모바일 연결" onClick={actions.openMobile}><Icon name="phone" size={19} /></button>
        <button className="icon-btn" style={{ color }} title="계정 설정" aria-label="계정 설정" onClick={actions.openAccount}>
          <Icon name="user" size={19} />
        </button>
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
          <Item icon="bulb" onClick={actions.openHelp}>기능 소개</Item>
          <Item onClick={actions.openAbout}>제품 정보</Item>
          <hr />
          {isDesktop ? <Item icon="power" onClick={actions.quit}>소프트웨어 종료</Item> : <Item icon="logout" onClick={actions.logout}>로그아웃</Item>}
        </Dropdown>
      </div>
    </header>
  );
}
