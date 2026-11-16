// Fonts offered in the editor and settings.
// "system" fonts come with Windows; "web" fonts are free Korean Google Fonts, loaded on demand
// so they look the same on every PC and phone.

const FALLBACK = "'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";

const system = (value, label, css) => ({ value, label, css: `${css}, ${FALLBACK}`, group: 'PC 기본 글꼴' });
const web = (family, label, kind = 'sans-serif', weights = '') => ({
  value: family,
  label,
  css: `'${family}', ${kind === 'serif' ? "'Batang', serif" : kind === 'cursive' ? FALLBACK : FALLBACK}`,
  group: kind === 'serif' ? '웹 글꼴 · 명조' : kind === 'cursive' ? '웹 글꼴 · 손글씨·장식' : '웹 글꼴 · 고딕',
  web: `${family.replace(/ /g, '+')}${weights ? `:wght@${weights}` : ''}`,
});

export const FONTS = [
  system('Dotum', '돋움', "Dotum, '돋움'"),
  system('Gulim', '굴림', "Gulim, '굴림'"),
  system('Batang', '바탕', "Batang, '바탕'"),
  system('Gungsuh', '궁서', "Gungsuh, '궁서'"),
  system('Malgun Gothic', '맑은 고딕', "'Malgun Gothic', '맑은 고딕'"),
  system('DotumChe', '돋움체', "DotumChe, '돋움체'"),
  system('GulimChe', '굴림체', "GulimChe, '굴림체'"),
  system('system', '시스템 기본', 'system-ui'),

  web('Noto Sans KR', '본고딕 (Noto Sans KR)', 'sans-serif', '400;700'),
  web('Nanum Gothic', '나눔고딕', 'sans-serif', '400;700'),
  web('Gothic A1', '고딕 A1', 'sans-serif', '400;700'),
  web('IBM Plex Sans KR', 'IBM 플렉스 산스', 'sans-serif', '400;700'),
  web('Gowun Dodum', '고운돋움'),
  web('Nanum Gothic Coding', '나눔고딕코딩', 'sans-serif', '400;700'),
  web('Do Hyeon', '도현'),
  web('Jua', '주아'),
  web('Black Han Sans', '검은고딕'),
  web('Sunflower', '해바라기', 'sans-serif', '300;500;700'),
  web('Dongle', '동글', 'sans-serif', '400;700'),
  web('Orbit', '오르빗'),

  web('Noto Serif KR', '본명조 (Noto Serif KR)', 'serif', '400;700'),
  web('Nanum Myeongjo', '나눔명조', 'serif', '400;700'),
  web('Gowun Batang', '고운바탕', 'serif', '400;700'),
  web('Song Myung', '송명', 'serif'),
  web('Hahmlet', '함렛', 'serif', '400;700'),

  web('Nanum Pen Script', '나눔손글씨 펜', 'cursive'),
  web('Nanum Brush Script', '나눔손글씨 붓', 'cursive'),
  web('Gaegu', '개구', 'cursive', '400;700'),
  web('Hi Melody', '하이멜로디', 'cursive'),
  web('Gamja Flower', '감자꽃', 'cursive'),
  web('Poor Story', '푸어스토리', 'cursive'),
  web('Yeon Sung', '연성', 'cursive'),
  web('Cute Font', '귀여운 글꼴', 'cursive'),
  web('Single Day', '싱글데이', 'cursive'),
  web('East Sea Dokdo', '동해독도', 'cursive'),
  web('Dokdo', '독도', 'cursive'),
  web('Stylish', '스타일리시', 'cursive'),
  web('Gugi', '구기', 'cursive'),
  web('Kirang Haerang', '기랑해랑', 'cursive'),
];

const byValue = new Map(FONTS.map((f) => [f.value, f]));
export const fontCss = (name) => (byValue.get(name) || FONTS[0]).css;

const loaded = new Set();
function addLink(href, key) {
  if (loaded.has(key) || typeof document === 'undefined') return;
  loaded.add(key);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

/** Load the web fonts among these names (setting values or CSS font-family stacks). */
export function ensureFonts(names) {
  for (const raw of names) {
    if (!raw) continue;
    const first = String(raw).split(',')[0].replace(/['"]/g, '').trim();
    const f = byValue.get(first);
    if (f?.web) addLink(`https://fonts.googleapis.com/css2?family=${f.web}&display=swap`, f.value);
  }
}

/** Load every web font (when a font menu opens, so each name shows in its own font). */
export function ensureFontPreviews() {
  ensureFonts(FONTS.filter((f) => f.web).map((f) => f.value));
}

/** Font families used inside formatted item text, e.g. from `font-family: 'Jua', ...`. */
export function fontsInHtml(html) {
  const out = [];
  for (const m of String(html || '').matchAll(/font-family:\s*([^;"]+)|face="([^"]+)"/g)) out.push(m[1] || m[2]);
  return out;
}
