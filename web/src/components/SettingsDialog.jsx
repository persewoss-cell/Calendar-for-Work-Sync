import { useEffect, useRef, useState } from 'react';
import { ColorInput, range, Row, Section, Select, Toggle } from './Modal.jsx';
import { Icon } from './Icon.jsx';
import { DEFAULT_SETTINGS } from '../lib/settings.js';
import { downloadSettings, settingsFromFile } from '../lib/settingsFile.js';
import { ensureFontPreviews, fontCss, FONTS } from '../lib/fonts.js';
import { api } from '../lib/api.js';
import { HOLIDAY_REGIONS } from '../lib/holidays.js';
import { playSound, SOUNDS } from '../lib/sound.js';
import { desktop, isDesktop } from '../lib/desktop.js';
import { WEEKDAYS } from '../lib/date.js';
import { availableKeys, MODIFIERS, modifierLabel, splitShortcut } from '../lib/shortcuts.js';

export const APP_VERSION = '1.0.0';

const TABS = [
  { id: 'calendar', label: '캘린더', icon: 'calendar' },
  { id: 'cell', label: '셀', icon: 'note' },
  { id: 'font', label: '글꼴 및 색상', icon: 'settings' },
  { id: 'advanced', label: '고급', icon: 'move' },
  { id: 'about', label: '제품 정보', icon: 'info' },
];

const percent = (from, to, step) => Array.from({ length: (to - from) / step + 1 }, (_, i) => ({ value: from + i * step, label: `${from + i * step}%` }));
const soundOptions = Object.entries(SOUNDS).map(([value, s]) => ({ value, label: s.label }));

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

/**
 * A shortcut chosen from two lists: the modifier keys, then a letter/number/symbol. Picking the
 * modifiers first narrows the second list to keys nothing else uses with them (Windows, common
 * programs, our other shortcuts). Shows when another program has already taken the combination.
 */
function ShortcutRow({ label, hint, value, onChange, used = [], status }) {
  const parsed = splitShortcut(value.keys);
  const known = MODIFIERS.some((m) => m.value === parsed.mod);
  const mods = known ? MODIFIERS : [{ value: parsed.mod, label: modifierLabel(parsed.mod) }, ...MODIFIERS];
  const keys = availableKeys(parsed.mod, used);
  const keyOptions = keys.includes(parsed.key) || !parsed.key ? keys : [parsed.key, ...keys];
  const setMod = (mod) => {
    const free = availableKeys(mod, used);
    onChange({ ...value, keys: `${mod}+${free.includes(parsed.key) ? parsed.key : free[0]}` });
  };
  return (
    <Row label={label} hint={status === false && value.enabled
      ? <span className="shortcut-warn">다른 프로그램이 이미 쓰는 조합입니다. 다른 키를 골라 주세요.</span>
      : hint}>
      <span className="shortcut-pick">
        <select className="select" value={parsed.mod} onChange={(e) => setMod(e.target.value)} aria-label={`${label} 조합 키`}>
          {mods.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <span className="shortcut-plus">+</span>
        <select className="select" value={parsed.key} onChange={(e) => onChange({ ...value, keys: `${parsed.mod}+${e.target.value}` })} aria-label={`${label} 키`}>
          {keyOptions.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </span>
      <Toggle checked={value.enabled} onChange={(enabled) => onChange({ ...value, enabled })} />
    </Row>
  );
}

/**
 * Font picker grouped by kind. Each name in the list is drawn in its own font (주아 in 주아), so
 * the user sees the lettering before choosing. A custom list, because a plain <select> can't
 * show fonts. The list floats over the settings page (fixed position) so it is never cut off.
 */
function FontSelect({ value, onChange, commonFont }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const listRef = useRef(null);
  const options = [
    ...(commonFont !== undefined ? [{ value: '', label: '공통 글꼴 사용', css: fontCss(commonFont), group: '' }] : []),
    ...FONTS,
  ];
  const current = options.find((o) => o.value === value) || options[0];

  const show = () => {
    ensureFontPreviews();
    const r = btnRef.current.getBoundingClientRect();
    const h = Math.min(360, window.innerHeight - 16);
    const below = window.innerHeight - r.bottom - 8;
    const top = below >= Math.min(h, 240) ? r.bottom + 4 : Math.max(8, r.top - 4 - h);
    setPos({ left: Math.min(r.left, window.innerWidth - 248), top, maxHeight: Math.min(h, below >= 240 ? below : r.top - 12) });
    setOpen(true);
  };
  const pick = (v) => { setOpen(false); onChange(v); btnRef.current?.focus(); };

  useEffect(() => {
    if (!open) return undefined;
    listRef.current?.querySelector('.on')?.scrollIntoView({ block: 'center' });
    const outside = (e) => { if (!listRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); btnRef.current?.focus(); } };
    const scroll = (e) => { if (!listRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', key, true);
    document.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', scroll);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', scroll);
    };
  }, [open]);

  return (
    <span className="font-select">
      <button type="button" ref={btnRef} className={`select font-btn ${open ? 'open' : ''}`} aria-haspopup="listbox" aria-expanded={open}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(e) => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); show(); } }}>
        <span className="font-btn-label" style={{ fontFamily: current.css }}>{current.label}</span>
      </button>
      {open && pos && (
        <div className="font-list" role="listbox" ref={listRef} style={{ left: pos.left, top: pos.top, maxHeight: pos.maxHeight }}>
          {options.map((o, i) => (
            <div key={o.value || 'common'}>
              {o.group && o.group !== options[i - 1]?.group && <div className="font-list-group">{o.group}</div>}
              <button type="button" role="option" aria-selected={o.value === value} className={`font-opt ${o.value === value ? 'on' : ''}`}
                style={{ fontFamily: o.css }} onClick={() => pick(o.value)}>
                {o.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </span>
  );
}

const sizeOptions = (from, to) => range(from, to, (n) => `${n}px`);

const CAL_TEXT = [
  ['title', '제목', 10, 36],
  ['today', '오늘 날짜', 8, 30],
  ['weekday', '요일', 9, 30],
  ['day', '날짜 숫자', 9, 40],
  ['month', '월 표시', 9, 30],
  ['holiday', '휴일·기념일', 8, 24],
  ['term', '24절기', 8, 24],
  ['lunar', '음력', 8, 20],
  ['dday', 'D-day', 8, 24],
];

/** One row of the calendar text table: font · size · color · bold. */
function TextStyleRow({ label, value, min, max, onChange, hint, commonFont }) {
  return (
    <Row label={label} hint={hint}>
      <FontSelect value={value.font || ''} commonFont={commonFont} onChange={(font) => onChange({ ...value, font })} />
      <Select value={value.size} onChange={(size) => onChange({ ...value, size })} options={sizeOptions(min, max)} />
      <ColorInput value={value.color} onChange={(color) => onChange({ ...value, color })} />
      <button type="button" className={`bold-toggle ${value.bold ? 'on' : ''}`} title="굵게" aria-pressed={value.bold}
        onClick={() => onChange({ ...value, bold: !value.bold })}>B</button>
    </Row>
  );
}

export const autoCollapseMs = (a) => ((Number(a.h) || 0) * 3600 + (Number(a.m) || 0) * 60 + (Number(a.s) || 0)) * 1000;

const ITEM_PROP = { editFontFamily: ['font-family', '글꼴'], editFontSize: ['font-size', '크기'], editTextColor: ['color', '색'] };

export function SettingsDialog({ s, update, onClose, initialTab = 'calendar', onOpenHelp, standalone = false }) {
  const [tab, setTab] = useState(initialTab);
  const set = (k) => (v) => update({ [k]: v });
  const setText = (k) => (v) => update({ calText: { ...s.calText, [k]: v } });

  // 편집 내용 공통 글꼴: after a change, ask whether items formatted by hand should follow it too.
  const [ask, setAsk] = useState(null); // { props: [...], counts }
  const pendingProps = useRef(new Set());
  const askTimer = useRef(null);
  const setItemStyle = (k) => (v) => {
    update({ [k]: v });
    pendingProps.current.add(ITEM_PROP[k][0]);
    clearTimeout(askTimer.current);
    askTimer.current = setTimeout(async () => {
      const props = [...pendingProps.current];
      pendingProps.current.clear();
      try {
        const usage = await api.styleUsage();
        const hit = props.filter((p) => usage[p] > 0);
        if (hit.length) setAsk({ props: hit, count: Math.max(...hit.map((p) => usage[p])) });
      } catch { /* offline: nothing to ask */ }
    }, 900);
  };
  const answer = async (applyAll) => {
    const { props } = ask;
    setAsk(null);
    if (applyAll) await api.stripStyle(props).catch(() => {});
  };
  useEffect(() => () => clearTimeout(askTimer.current), []);

  // Drag the window by its title bar; remember where it was.
  const [pos, setPos] = useState(() => {
    try { return JSON.parse(localStorage.getItem('settingsPos')) || null; } catch { return null; }
  });
  const drag = useRef(null);
  const onTitleDown = (e) => {
    if (e.target.closest('button')) return;
    const rect = e.currentTarget.parentElement.getBoundingClientRect();
    drag.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onTitleMove = (e) => {
    if (!drag.current) return;
    const x = Math.min(Math.max(e.clientX - drag.current.dx, -600), window.innerWidth - 120);
    const y = Math.min(Math.max(e.clientY - drag.current.dy, 0), window.innerHeight - 40);
    setPos({ x, y });
  };
  const onTitleUp = () => {
    if (!drag.current) return;
    drag.current = null;
    try { localStorage.setItem('settingsPos', JSON.stringify(pos)); } catch { /* ignore */ }
  };
  const setShortcut = (k) => (v) => update({ shortcuts: { ...s.shortcuts, [k]: v } });
  // Keys taken by our other shortcuts are not offered again.
  const usedBy = (k) => Object.entries(s.shortcuts).filter(([n]) => n !== k).map(([, sc]) => sc.keys);
  const [shortcutStatus, setShortcutStatus] = useState({});
  useEffect(() => {
    desktop?.getShortcutStatus?.().then((st) => setShortcutStatus(st || {})).catch(() => {});
    return desktop?.onShortcutStatus?.((st) => setShortcutStatus(st || {}));
  }, []);
  const current = TABS.find((t) => t.id === tab);
  // 설정값 내보내기 / 가져오기 (a .json file with the settings only, not the calendar items)
  const fileRef = useRef(null);
  const [fileMsg, setFileMsg] = useState('');
  useEffect(() => { if (!fileMsg) return undefined; const t = setTimeout(() => setFileMsg(''), 4000); return () => clearTimeout(t); }, [fileMsg]);
  const importSettings = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const next = settingsFromFile(await file.text());
      if (!confirm(`「${file.name}」의 설정으로 바꿀까요?\n지금 계정의 설정(모양·글꼴·단축키 등)이 이 파일의 값으로 바뀝니다. 일정은 바뀌지 않습니다.`)) return;
      update(next);
      setFileMsg('설정을 가져와 적용했습니다.');
    } catch (err) {
      setFileMsg(`!${err.message}`);
    }
  };

  return (
    <div className={standalone ? 'settings-layer standalone' : 'settings-layer'}>
      <div className="settings-window" role="dialog" aria-label="설정"
        style={pos && !standalone ? { position: 'absolute', left: pos.x, top: pos.y } : undefined}>
        <div className="settings-titlebar" title="끌어서 옮길 수 있습니다"
          {...(standalone ? {} : { onPointerDown: onTitleDown, onPointerMove: onTitleMove, onPointerUp: onTitleUp })}>
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
            <div className="settings-file">
              <button type="button" className="settings-file-btn" onClick={() => { downloadSettings(s); setFileMsg('설정 파일을 저장했습니다.'); }}>
                <Icon name="download" size={14} /> 설정값 내보내기
              </button>
              <button type="button" className="settings-file-btn" onClick={() => fileRef.current?.click()}>
                <Icon name="upload" size={14} /> 설정값 가져오기
              </button>
              <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={importSettings} />
              {fileMsg && <small className={`settings-file-msg ${fileMsg.startsWith('!') ? 'bad' : ''}`}>{fileMsg.replace(/^!/, '')}</small>}
            </div>
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
                  <Row label="최대 행" hint={s.viewStyle === 'rolling' ? '' : s.viewStyle === 'month' ? '전체 월: 그 달이 다 보이는 줄 수보다 크게 하면 아래에 줄이 더 붙습니다.' : '변동 월·전체 월에서 쓰입니다.'}>
                    <Select value={s.maxRows} onChange={set('maxRows')} options={range(1, 8)} />
                  </Row>
                  <Row label="지나간 주 표시" hint={s.viewStyle === 'rolling' ? '이번 주 위에 지난주를 몇 줄 보여줄지' : '변동 월에서만 쓰입니다.'}>
                    <Select value={s.pastWeeks} onChange={set('pastWeeks')} options={range(0, 4)} />
                  </Row>
                  <Row label="최대 열 수" hint={s.viewStyle === 'strip' ? '' : '변동 단일 행에서만 쓰입니다.'}>
                    <Select value={s.maxColumns} onChange={set('maxColumns')} options={range(3, 14)} />
                  </Row>
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
                  <Row label="완료 작업 자동으로 맨 아래 줄로 이동" hint="한 칸에 일정이 여러 개일 때 완료한 일이 아래로 내려갑니다."><Toggle checked={s.doneToBottom} onChange={set('doneToBottom')} /></Row>
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
                <Section title="캘린더 글꼴 (달력의 제목·요일·날짜)">
                  <Row label="공통 글꼴"><FontSelect value={s.fontFamily} onChange={set('fontFamily')} /></Row>
                  <div className="text-table-head"><span>항목</span><span>글꼴 · 크기 · 색 · 굵게</span></div>
                  {CAL_TEXT.map(([k, label, min, max]) => (
                    <TextStyleRow key={k} label={label} value={s.calText[k]} min={min} max={max} onChange={setText(k)} commonFont={s.fontFamily}
                      hint={k === 'lunar' && !s.showLunar ? '캘린더 탭에서 「음력」을 켜야 보입니다.' : k === 'term' && !s.showSolarTerms ? '캘린더 탭에서 「24절기」를 켜야 보입니다.' : k === 'holiday' && !s.showHolidays ? '캘린더 탭에서 「공휴일」을 켜야 보입니다.' : ''} />
                  ))}
                </Section>
                <Section title="편집 내용 공통 글꼴 및 크기">
                  <p className="set-note">달력 칸에 적은 일정 글자의 기본 모양입니다. 입력창에서 직접 바꾼 글자는 따로 물어본 뒤에 바꿉니다.</p>
                  <Row label="글꼴"><FontSelect value={s.editFontFamily} onChange={setItemStyle('editFontFamily')} /></Row>
                  <Row label="크기"><Select value={s.editFontSize} onChange={setItemStyle('editFontSize')} options={sizeOptions(9, 32)} /></Row>
                  <Row label="색"><ColorInput value={s.editTextColor} onChange={setItemStyle('editTextColor')} /></Row>
                  {ask && (
                    <div className="apply-ask" role="alert">
                      <p>입력창에서 <b>{ask.props.map((p) => Object.values(ITEM_PROP).find(([css]) => css === p)[1]).join('·')}</b>을(를) 직접 바꾼 일정이 있습니다 (최대 {ask.count}개). 그 일정에도 새 설정을 적용할까요?</p>
                      <div className="inline">
                        <button className="btn primary small" onClick={() => answer(true)}>모두 적용</button>
                        <button className="btn small" onClick={() => answer(false)}>직접 바꾼 건 그대로</button>
                      </div>
                    </div>
                  )}
                </Section>
                <Section title="기타 색상">
                  <Row label="캘린더 배경"><ColorInput value={s.bgColor} onChange={set('bgColor')} /></Row>
                  <Row label="토요일 배경색"><ColorInput value={s.saturdayBgColor} onChange={set('saturdayBgColor')} /></Row>
                  <Row label="일요일·공휴일 배경색"><ColorInput value={s.sundayBgColor} onChange={set('sundayBgColor')} /></Row>
                  <Row label="오늘의 테두리"><ColorInput value={s.todayBorder} onChange={set('todayBorder')} /></Row>
                  <Row label="제목 표시줄 버튼 색상"><ColorInput value={s.titleButtonColor} onChange={set('titleButtonColor')} /></Row>
                </Section>
                <Section title="투명도">
                  <Row label="투명도"><Select value={s.opacity} onChange={set('opacity')} options={percent(0, 90, 10)} /></Row>
                  <Row label="유리 효과"><Toggle checked={s.glass} onChange={set('glass')} /></Row>
                </Section>
              </>
            )}

            {tab === 'advanced' && (
              <>
                <Section title="고급 설정">
                  <Row label="시작 요일">
                    <Select value={s.weekStart} onChange={set('weekStart')} options={WEEKDAYS.ko.map((label, value) => ({ value, label }))} />
                  </Row>
                  <Row label="첫번째 주" hint={`올해 X주차를 첫 번째 주로 설정합니다.${s.weekNumbers ? '' : ' (캘린더 탭에서 「주 번호」를 켜야 보입니다)'}`}>
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
                <Section title="자동 접기">
                  <Row label="자동 접기" hint="달력을 클릭하거나 입력·스크롤하지 않은 채 정한 시간이 지나면 왼쪽 위 작은 아이콘으로 접힙니다. 마우스를 그냥 움직이는 것은 세지 않습니다.">
                    <Toggle checked={s.autoCollapse.enabled} onChange={(enabled) => update({ autoCollapse: { ...s.autoCollapse, enabled } })} />
                  </Row>
                  <Row label="접기까지 시간" hint={s.autoCollapse.enabled ? (autoCollapseMs(s.autoCollapse) < 5000 ? '5초보다 짧게는 정할 수 없어 5초로 동작합니다.' : '') : '자동 접기를 켜면 정할 수 있습니다.'}>
                    <span className={`duration ${s.autoCollapse.enabled ? '' : 'off'}`}>
                      {[['h', '시간', 23], ['m', '분', 59], ['s', '초', 59]].map(([k, unit, max]) => (
                        <label key={k}>
                          <input type="number" className="input" min="0" max={max} value={s.autoCollapse[k]} disabled={!s.autoCollapse.enabled}
                            onChange={(e) => update({ autoCollapse: { ...s.autoCollapse, [k]: Math.min(max, Math.max(0, Math.floor(Number(e.target.value) || 0))) } })} />
                          {unit}
                        </label>
                      ))}
                      <span>후 접기</span>
                    </span>
                  </Row>
                </Section>
                <Section title="단축키">
                  <ShortcutRow label="맨 위로 보기 / 바탕화면으로" hint="PC 앱: 달력을 모든 창 위에 투명하지 않게 띄우고, 다시 누르면 바탕화면으로 돌아갑니다."
                    value={s.shortcuts.toggleOnTop} onChange={setShortcut('toggleOnTop')} used={usedBy('toggleOnTop')} status={shortcutStatus.toggleOnTop} />
                  <ShortcutRow label="캘린더 숨기기" value={s.shortcuts.hideCalendar} onChange={setShortcut('hideCalendar')} used={usedBy('hideCalendar')} status={shortcutStatus.hideCalendar} />
                  <ShortcutRow label="예약된 작업 표시 및 숨기기" value={s.shortcuts.toggleTasks} onChange={setShortcut('toggleTasks')} used={usedBy('toggleTasks')} status={shortcutStatus.toggleTasks} />
                  <ShortcutRow label="편집 완료" value={s.shortcuts.finishEdit} onChange={setShortcut('finishEdit')} used={usedBy('finishEdit')} />
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
