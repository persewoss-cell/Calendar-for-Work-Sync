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

  // 글꼴 및 색상
  fontFamily: 'Dotum',
  fontSize: 13,
  textColor: '#ffffff',
  editFontFamily: 'Gulim',
  editFontSize: 14,
  editTextColor: '#ffffff',
  bgColor: '#1a8fd8',
  holidayBgColor: '#3c5f8f',
  todayBorder: '#fffde7',
  titleButtonColor: '#ffffff',
  holidayTextColor: '#ffb300',
  solarTermColor: '#00c853',
  opacity: 60,
  countdownOpacity: 40,

  // 메모
  noteListStyle: 'bullet',
  noteOpacity: 20,
  noteLineSpacing: 2,
  noteFontFamily: 'Dotum',
  noteFontSize: 14,
  noteTextColor: '#4e4b1f',
  noteTextBackground: true,
  noteCheckbox: true,

  // 고급
  weekStart: 0,
  firstWeek: 1,
  showRestDays: true,
  restDays: [0, 6],
  shortcuts: {
    hideCalendar: { enabled: false, keys: 'Ctrl+Alt+H' },
    toggleTasks: { enabled: false, keys: 'Ctrl+Alt+F' },
    toggleNotes: { enabled: false, keys: 'Ctrl+Alt+B' },
    finishEdit: { enabled: false, keys: 'Ctrl+Alt+E' },
  },
  language: 'ko',
  autoLaunch: true,
  autoUpdate: true,
  timezone: 'Asia/Seoul',

  // 메뉴 토글
  hideTasks: false,
  showNotes: true,
};

export const FONTS = [
  { value: 'Dotum', label: '돋움 (Dotum)', css: "Dotum, '돋움', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif" },
  { value: 'Gulim', label: '굴림 (Gulim)', css: "Gulim, '굴림', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif" },
  { value: 'Malgun Gothic', label: '맑은 고딕', css: "'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif" },
  { value: 'Batang', label: '바탕 (Batang)', css: "Batang, '바탕', 'Nanum Myeongjo', serif" },
  { value: 'Noto Sans KR', label: 'Noto Sans KR', css: "'Noto Sans KR', 'Malgun Gothic', sans-serif" },
  { value: 'Nanum Gothic', label: '나눔고딕', css: "'Nanum Gothic', 'Malgun Gothic', sans-serif" },
  { value: 'system', label: '시스템 기본', css: 'system-ui, sans-serif' },
];
export const fontCss = (name) => (FONTS.find((f) => f.value === name) || FONTS[0]).css;

export function mergeSettings(saved = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    shortcuts: { ...DEFAULT_SETTINGS.shortcuts, ...(saved.shortcuts || {}) },
  };
}

export const hexToRgba = (hex, alpha) => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};
