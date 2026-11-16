// Every option from the original program's settings screens, with defaults matching the captures.
export const DEFAULT_SETTINGS = {
  // 캘린더 > 사용자 지정 스타일
  viewStyle: 'month', // rolling(변동 월) | month(전체 월) | week(고정 단일 행) | strip(변동 단일 행)
  maxRows: 5,
  pastWeeks: 1,
  maxColumns: 7,
  // 캘린더 > 디스플레이 효과
  glass: true,
  monthGap: false,
  weekNumbers: false,
  shadow: false,
  showTitleBar: true,
  // 캘린더 > 휴일 / 음력 절기
  showHolidays: true,
  holidayRegions: ['KR'],
  showObservances: true,
  showLunar: false,
  showSolarTerms: true,

  // 셀
  listStyle: 'bullet', // none | number | bullet
  cellPadding: 1,
  lineSpacing: 1,
  showCheckbox: true,
  doneToBottom: true,
  showDone: true,
  showDoneIcon: true,
  showReminderTime: true,
  autoPostpone: false,
  textBackground: 'off', // off | light | dark
  editSound: 'tick',
  reminderSound: 'twinkle',

  // 글꼴 및 색상 — 캘린더 글꼴: 달력의 제목·요일·날짜 등 (항목별 크기·색·굵기)
  fontFamily: 'Dotum',
  calText: {
    title: { size: 13, color: '#ffffff', bold: false }, // 상단 제목 (오늘은 …)
    weekday: { size: 13, color: '#ffffff', bold: false }, // 요일
    day: { size: 12, color: '#ffffff', bold: false }, // 날짜 숫자
    month: { size: 12, color: '#ffffff', bold: false }, // 월 표시 (11월)
    holiday: { size: 12, color: '#ffb300', bold: false }, // 휴일·기념일 이름
    term: { size: 12, color: '#00c853', bold: false }, // 24절기
    lunar: { size: 10, color: '#ffffff', bold: false }, // 음력
    dday: { size: 12, color: '#fff59d', bold: true }, // D-day (대상 날짜, 오늘 칸의 D-45)
  },
  // 편집 내용 공통 글꼴 및 크기 — 내가 입력한 일정 글자의 기본 모양
  editFontFamily: 'Dotum',
  editFontSize: 13,
  editTextColor: '#ffffff',
  bgColor: '#1a8fd8',
  saturdayBgColor: '#bbdefb', // 토요일 (연한 파랑)
  sundayBgColor: '#ffcdd2', // 일요일·공휴일 (연한 빨강)
  todayBorder: '#fffde7',
  titleButtonColor: '#ffffff',
  opacity: 60,


  // 고급
  weekStart: 0,
  firstWeek: 1,
  showRestDays: true,
  restDays: [0, 6],
  shortcuts: {
    hideCalendar: { enabled: false, keys: 'Ctrl+Alt+H' },
    toggleTasks: { enabled: false, keys: 'Ctrl+Alt+F' },
    finishEdit: { enabled: false, keys: 'Ctrl+Alt+E' },
  },
  language: 'ko',
  autoLaunch: true,
  autoUpdate: true,
  timezone: 'Asia/Seoul',

  // 메뉴 토글
  hideTasks: false,
};

export { FONTS, fontCss } from './fonts.js';

export function mergeSettings(saved = {}) {
  const calText = {};
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS.calText)) calText[k] = { ...v, ...(saved.calText?.[k] || {}) };
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    calText,
    shortcuts: Object.fromEntries(Object.keys(DEFAULT_SETTINGS.shortcuts).map((k) => [k, { ...DEFAULT_SETTINGS.shortcuts[k], ...(saved.shortcuts?.[k] || {}) }])),
  };
}

/**
 * Settings saved before the calendar text was split per element: carry the old single
 * font size / colors over so nothing changes look on upgrade. Returns a patch or null.
 */
export function migrateSettings(saved = {}) {
  if (saved.calText) return null;
  const size = Number(saved.fontSize) || 13;
  const color = saved.textColor || '#ffffff';
  const base = { size, color, bold: false };
  return {
    calText: {
      title: { ...base, size: Math.max(size, 13) },
      weekday: { ...base, size: Math.max(size, 13) },
      day: { ...base, size: Math.max(size - 1, 10) },
      month: { ...base, size: Math.max(size - 1, 10) },
      holiday: { ...base, size: Math.max(size - 1, 10), color: saved.holidayTextColor || '#ffb300' },
      term: { ...base, size: Math.max(size - 1, 10), color: saved.solarTermColor || '#00c853' },
      lunar: { ...base, size: 10 },
      dday: { ...base, size: Math.max(size - 1, 10), color: '#fff59d', bold: true },
    },
    editFontFamily: saved.fontFamily || 'Dotum',
    editFontSize: size,
    editTextColor: color,
  };
}

export const hexToRgba = (hex, alpha) => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};
