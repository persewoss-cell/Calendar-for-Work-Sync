import { useState } from 'react';
import { ColorInput, range, Row, Section, Select, Toggle } from './Modal.jsx';
import { Icon } from './Icon.jsx';
import { DEFAULT_SETTINGS, FONTS } from '../lib/settings.js';
import { HOLIDAY_REGIONS } from '../lib/holidays.js';
import { playSound, SOUNDS } from '../lib/sound.js';
import { isDesktop } from '../lib/desktop.js';
import { WEEKDAYS } from '../lib/date.js';

export const APP_VERSION = '1.0.0';

const TABS = [
  { id: 'calendar', label: '캘린더', icon: 'calendar' },
  { id: 'cell', label: '셀', icon: 'note' },
  { id: 'font', label: '글꼴 및 색상', icon: 'settings' },
  { id: 'memo', label: '메모', icon: 'note' },
  { id: 'advanced', label: '고급', icon: 'move' },
  { id: 'about', label: '제품 정보', icon: 'info' },
];

const percent = (from, to, step) => Array.from({ length: (to - from) / step + 1 }, (_, i) => ({ value: from + i * step, label: `${from + i * step}%` }));
const soundOptions = Object.entries(SOUNDS).map(([value, s]) => ({ value, label: s.label }));
const fontOptions = FONTS.map((f) => ({ value: f.value, label: f.label }));

function StyleCard({ selected, label, onClick, children }) {
  return (
    <button type="button" className={`style-card ${selected ? 'on' : ''}`} onClick={onClick}>
      <span className="style-art">{children}{selected && <span className="style-check"><Icon name="check" size={12} stroke={3} /></span>}</span>
      <span>{label}</span>
    </button>
  );
}

const Blocks = ({ rows, cols, hl = [] }) => (
  <svg viewBox="0 0 60 48" width="60" height="48">
    {Array.from({ length: rows * cols }, (_, i) => {
      const r = Math.floor(i / cols); const c = i % cols;
      const w = 52 / cols; const h = 40 / rows;
      return <rect key={i} x={4 + c * w + 1} y={4 + r * h + 1} width={w - 2} height={h - 2} rx="1.5" fill={hl.includes(i) ? '#9aa6b5' : '#5c6b7c'} />;
    })}
  </svg>
);

function ListStylePicker({ value, onChange }) {
  const opts = [
    { v: 'none', label: '아니', art: ['', '', ''] },
    { v: 'number', label: '번호가 표시됩니다', art: ['1', '2', '3'] },
    { v: 'bullet', label: '마크로 포인트', art: ['•', '•', '•'] },
  ];
  return (
    <div className="style-cards">
      {opts.map((o) => (
        <StyleCard key={o.v} selected={value === o.v} label={o.label} onClick={() => onChange(o.v)}>
          <svg viewBox="0 0 60 48" width="60" height="48">
            {o.art.map((m, i) => (
              <g key={i}>
                {m && <text x="8" y={14 + i * 13} fontSize="10" fontWeight="bold" fill="#5c6b7c">{m}</text>}
                <rect x={m ? 18 : 8} y={7 + i * 13} width={i === 1 ? 34 : 26} height="5" rx="2.5" fill="#9aa6b5" />
              </g>
            ))}
          </svg>
        </StyleCard>
      ))}
    </div>
  );
}

function ShortcutRow({ label, value, onChange }) {
  return (
    <Row label={label} hint="키보드로 직접 입력하고 수정할 수 있습니다.">
      <input className="input shortcut" value={value.keys}
        onKeyDown={(e) => {
          if (['Control', 'Alt', 'Shift', 'Meta', 'Tab'].includes(e.key)) return;
          e.preventDefault();
          const keys = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Meta', e.key.length === 1 ? e.key.toUpperCase() : e.key]
            .filter(Boolean).join('+');
          onChange({ ...value, keys });
        }} readOnly />
      <Toggle checked={value.enabled} onChange={(enabled) => onChange({ ...value, enabled })} />
    </Row>
  );
}

export function SettingsDialog({ s, update, onClose, initialTab = 'calendar', onOpenHelp }) {
  const [tab, setTab] = useState(initialTab);
  const set = (k) => (v) => update({ [k]: v });
  const setShortcut = (k) => (v) => update({ shortcuts: { ...s.shortcuts, [k]: v } });
  const current = TABS.find((t) => t.id === tab);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="settings-window" role="dialog" aria-label="설정">
        <div className="settings-titlebar">
          <span className="app-mark" />캘린더 목록 - 설정
          <button className="icon-btn dark" onClick={onClose} aria-label="닫기"><Icon name="x" /></button>
        </div>
        <div className="settings-main">
          <nav className="settings-nav">
            {TABS.map((t) => (
              <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
                <Icon name={t.icon} size={18} /> {t.label}
              </button>
            ))}
            <button className="reset-link" onClick={() => confirm('모든 설정을 기본값으로 되돌릴까요?') && update({ ...DEFAULT_SETTINGS })}>
              기본 설정으로 사용
            </button>
          </nav>
          <div className="settings-content">
            <h1>{tab === 'about' ? '캘린더 목록 정보' : current.label}</h1>

            {tab === 'calendar' && (
              <>
                <Section title="사용자 지정 스타일">
                  <div className="style-cards">
                    <StyleCard selected={s.viewStyle === 'rolling'} label="변동 월" onClick={() => set('viewStyle')('rolling')}><Blocks rows={4} cols={5} hl={[2, 17]} /></StyleCard>
                    <StyleCard selected={s.viewStyle === 'month'} label="전체 월" onClick={() => set('viewStyle')('month')}><Blocks rows={4} cols={5} /></StyleCard>
                    <StyleCard selected={s.viewStyle === 'week'} label="고정 단일 행" onClick={() => set('viewStyle')('week')}><Blocks rows={1} cols={5} /></StyleCard>
                    <StyleCard selected={s.viewStyle === 'strip'} label="변동 단일 행" onClick={() => set('viewStyle')('strip')}><Blocks rows={1} cols={5} hl={[0, 4]} /></StyleCard>
                  </div>
                  <Row label="최대 행"><Select value={s.maxRows} onChange={set('maxRows')} options={range(1, 8)} /></Row>
                  <Row label="지나간 주 표시"><Select value={s.pastWeeks} onChange={set('pastWeeks')} options={range(0, 4)} /></Row>
                  <Row label="최대 열 수"><Select value={s.maxColumns} onChange={set('maxColumns')} options={range(3, 14)} /></Row>
                </Section>
                <Section title="디스플레이 효과">
                  <Row label="유리 효과"><Toggle checked={s.glass} onChange={set('glass')} /></Row>
                  <Row label="월 간격"><Toggle checked={s.monthGap} onChange={set('monthGap')} /></Row>
                  <Row label="주 번호"><Toggle checked={s.weekNumbers} onChange={set('weekNumbers')} /></Row>
                  <Row label="그림자"><Toggle checked={s.shadow} onChange={set('shadow')} /></Row>
                  <Row label="제목 표시줄 표시" hint="끄면 마우스를 위쪽에 올릴 때만 나타납니다."><Toggle checked={s.showTitleBar} onChange={set('showTitleBar')} /></Row>
                </Section>
                <Section title="휴일">
                  <Row label="공휴일"><Toggle checked={s.showHolidays} onChange={set('showHolidays')} /></Row>
                  <Row label="휴가 지역">
                    <div className="chips">
                      {Object.entries(HOLIDAY_REGIONS).map(([code, name]) => (
                        <label key={code} className={`chip ${s.holidayRegions.includes(code) ? 'on' : ''}`}>
                          <input type="checkbox" checked={s.holidayRegions.includes(code)} onChange={(e) => set('holidayRegions')(
                            e.target.checked ? [...s.holidayRegions, code] : s.holidayRegions.filter((c) => c !== code),
                          )} />{name}
                        </label>
                      ))}
                    </div>
                  </Row>
                  <Row label="기념일 표시" hint="어버이날, 스승의 날, 추수감사절 등"><Toggle checked={s.showObservances} onChange={set('showObservances')} /></Row>
                </Section>
                <Section title="음력 절기">
                  <Row label="음력"><Toggle checked={s.showLunar} onChange={set('showLunar')} /></Row>
                  <Row label="24절기"><Toggle checked={s.showSolarTerms} onChange={set('showSolarTerms')} /></Row>
                </Section>
              </>
            )}

            {tab === 'cell' && (
              <>
                <Section title="사용자 지정 스타일">
                  <ListStylePicker value={s.listStyle} onChange={set('listStyle')} />
                  <Row label="셀 간격"><Select value={s.cellPadding} onChange={set('cellPadding')} options={range(0, 6)} /></Row>
                  <Row label="줄 간격"><Select value={s.lineSpacing} onChange={set('lineSpacing')} options={range(0, 6)} /></Row>
                </Section>
                <Section title="함수">
                  <Row label="체크박스 표시"><Toggle checked={s.showCheckbox} onChange={set('showCheckbox')} /></Row>
                  <Row label="완료 작업 자동으로 맨 아래 줄로 이동"><Toggle checked={s.doneToBottom} onChange={set('doneToBottom')} /></Row>
                  <Row label="완료된 작업 표시"><Toggle checked={s.showDone} onChange={set('showDone')} /></Row>
                  <Row label="완료 아이콘 표시"><Toggle checked={s.showDoneIcon} onChange={set('showDoneIcon')} /></Row>
                  <Row label="알림 시간 표시"><Toggle checked={s.showReminderTime} onChange={set('showReminderTime')} /></Row>
                  <Row label="미완료 작업 30일 동안 자동 연기" hint="지난 30일 안의 끝내지 못한 일을 오늘로 옮깁니다."><Toggle checked={s.autoPostpone} onChange={set('autoPostpone')} /></Row>
                  <Row label="텍스트 배경 표시">
                    <Select value={s.textBackground} onChange={set('textBackground')} options={[{ value: 'off', label: '끄기' }, { value: 'light', label: '밝게' }, { value: 'dark', label: '어둡게' }]} />
                  </Row>
                </Section>
                <Section title="프롬프트 사운드 효과">
                  <Row label="편집 완료 알람">
                    <Select value={s.editSound} onChange={(v) => { set('editSound')(v); playSound(v); }} options={soundOptions} />
                  </Row>
                  <Row label="리마인드 알람">
                    <Select value={s.reminderSound} onChange={(v) => { set('reminderSound')(v); playSound(v); }} options={soundOptions} />
                  </Row>
                </Section>
              </>
            )}

            {tab === 'font' && (
              <>
                <Section title="글꼴 색상 및 텍스트 크기">
                  <Row label="캘린더 글꼴">
                    <Select value={s.fontFamily} onChange={set('fontFamily')} options={fontOptions} />
                    <Select value={s.fontSize} onChange={set('fontSize')} options={range(10, 22, (n) => `${n}px`)} />
                    <ColorInput value={s.textColor} onChange={set('textColor')} />
                  </Row>
                  <Row label="편집 내용의 글꼴 크기 및 색상">
                    <Select value={s.editFontFamily} onChange={set('editFontFamily')} options={fontOptions} />
                    <Select value={s.editFontSize} onChange={set('editFontSize')} options={range(10, 22, (n) => `${n}px`)} />
                    <ColorInput value={s.editTextColor} onChange={set('editTextColor')} />
                  </Row>
                </Section>
                <Section title="기타 색상">
                  <Row label="캘린더 배경"><ColorInput value={s.bgColor} onChange={set('bgColor')} /></Row>
                  <Row label="휴일 배경색"><ColorInput value={s.holidayBgColor} onChange={set('holidayBgColor')} /></Row>
                  <Row label="오늘의 테두리"><ColorInput value={s.todayBorder} onChange={set('todayBorder')} /></Row>
                  <Row label="제목 표시줄 버튼 색상"><ColorInput value={s.titleButtonColor} onChange={set('titleButtonColor')} /></Row>
                  <Row label="휴일 텍스트 색상"><ColorInput value={s.holidayTextColor} onChange={set('holidayTextColor')} /></Row>
                  <Row label="24절기 텍스트 색상"><ColorInput value={s.solarTermColor} onChange={set('solarTermColor')} /></Row>
                </Section>
                <Section title="투명도">
                  <Row label="투명도"><Select value={s.opacity} onChange={set('opacity')} options={percent(0, 90, 10)} /></Row>
                  <Row label="유리 효과"><Toggle checked={s.glass} onChange={set('glass')} /></Row>
                  <Row label="카운트다운 카드 투명도"><Select value={s.countdownOpacity} onChange={set('countdownOpacity')} options={percent(0, 90, 10)} /></Row>
                </Section>
              </>
            )}

            {tab === 'memo' && (
              <>
                <Section title="노트 표시">
                  <ListStylePicker value={s.noteListStyle} onChange={set('noteListStyle')} />
                  <Row label="메모 투명도"><Select value={s.noteOpacity} onChange={set('noteOpacity')} options={percent(0, 90, 10)} /></Row>
                  <Row label="줄 간격"><Select value={s.noteLineSpacing} onChange={set('noteLineSpacing')} options={range(0, 6)} /></Row>
                  <Row label="편집 내용의 글꼴 크기 및 색상">
                    <Select value={s.noteFontFamily} onChange={set('noteFontFamily')} options={fontOptions} />
                    <Select value={s.noteFontSize} onChange={set('noteFontSize')} options={range(10, 22, (n) => `${n}px`)} />
                    <ColorInput value={s.noteTextColor} onChange={set('noteTextColor')} />
                  </Row>
                  <Row label="텍스트 배경 표시"><Toggle checked={s.noteTextBackground} onChange={set('noteTextBackground')} /></Row>
                  <Row label="체크박스 표시"><Toggle checked={s.noteCheckbox} onChange={set('noteCheckbox')} /></Row>
                </Section>
                <Section title="노트 관리">
                  <Row label="스티커 메모 보이기"><Toggle checked={s.showNotes} onChange={set('showNotes')} /></Row>
                </Section>
              </>
            )}

            {tab === 'advanced' && (
              <>
                <Section title="고급 설정">
                  <Row label="시작 요일">
                    <Select value={s.weekStart} onChange={set('weekStart')} options={WEEKDAYS.ko.map((label, value) => ({ value, label }))} />
                  </Row>
                  <Row label="첫번째 주" hint="올해 X주차를 첫 번째 주로 설정합니다.">
                    <Select value={s.firstWeek} onChange={set('firstWeek')} options={range(1, 52)} />
                  </Row>
                </Section>
                <Section title="휴무일">
                  <Row label="쉬는날 표시"><Toggle checked={s.showRestDays} onChange={set('showRestDays')} /></Row>
                  <div className="rest-days">
                    <span>쉬는날</span>
                    {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                      <label key={d} className={`chip ${s.restDays.includes(d) ? 'on' : ''}`}>
                        <input type="checkbox" checked={s.restDays.includes(d)} onChange={(e) => set('restDays')(
                          e.target.checked ? [...s.restDays, d] : s.restDays.filter((x) => x !== d),
                        )} />{WEEKDAYS.ko[d]}
                      </label>
                    ))}
                  </div>
                </Section>
                <Section title="단축키">
                  <ShortcutRow label="캘린더 숨기기 단축키" value={s.shortcuts.hideCalendar} onChange={setShortcut('hideCalendar')} />
                  <ShortcutRow label="예약된 작업 단축키 표시 및 숨기기" value={s.shortcuts.toggleTasks} onChange={setShortcut('toggleTasks')} />
                  <ShortcutRow label="스티커 메모 표시/숨기기 단축키" value={s.shortcuts.toggleNotes} onChange={setShortcut('toggleNotes')} />
                  <ShortcutRow label="편집 완료 단축키" value={s.shortcuts.finishEdit} onChange={setShortcut('finishEdit')} />
                </Section>
                <Section title="소프트웨어 설정">
                  <Row label="언어선택">
                    <Select value={s.language} onChange={set('language')} options={[{ value: 'ko', label: '대한민국 - 한국어' }, { value: 'en', label: 'English (요일·제목)' }]} />
                  </Row>
                  <Row label="시간대">
                    <Select value={s.timezone} onChange={set('timezone')} options={['Asia/Seoul', 'Asia/Tokyo', 'America/Los_Angeles', 'America/New_York', 'Europe/London', 'UTC'].map((v) => ({ value: v, label: v }))} />
                  </Row>
                  <Row label="Windows 시작 시 실행" hint={isDesktop ? '' : 'PC 앱에서만 적용됩니다.'}><Toggle checked={s.autoLaunch} onChange={set('autoLaunch')} disabled={!isDesktop} /></Row>
                  <Row label="자동 업데이트 확인" hint={isDesktop ? '' : 'PC 앱에서만 적용됩니다.'}><Toggle checked={s.autoUpdate} onChange={set('autoUpdate')} disabled={!isDesktop} /></Row>
                </Section>
              </>
            )}

            {tab === 'about' && (
              <>
                <Section title="소프트웨어 정보">
                  <Row label={`캘린더 목록: ${APP_VERSION}`} />
                  <Row label={`실행 환경: ${isDesktop ? 'PC 앱 (Electron)' : window.matchMedia('(display-mode: standalone)').matches ? '모바일/설치형 앱 (PWA)' : '웹 브라우저'}`} />
                </Section>
                <Section title="도움말">
                  <Row label="기능 소개"><button className="link-btn" onClick={onOpenHelp}>자세히 보기 ›</button></Row>
                </Section>
                <Section title="저작권">
                  <Row label="Calendar for Work Sync — 개인 업무용으로 직접 만든 캘린더입니다." />
                </Section>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
