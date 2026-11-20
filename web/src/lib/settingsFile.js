// 설정값 내보내기 / 가져오기: only the calendar settings (look, fonts, shortcuts …), never items.
import { DEFAULT_SETTINGS, mergeSettings } from './settings.js';

const KIND = 'workcal-settings';

/** The file contents for the current settings. */
export function settingsToFile(s) {
  const settings = {};
  for (const k of Object.keys(DEFAULT_SETTINGS)) if (s[k] !== undefined) settings[k] = s[k];
  return JSON.stringify({ kind: KIND, version: 1, exportedAt: new Date().toISOString(), settings }, null, 2);
}

/** Settings read back from such a file (unknown keys dropped, missing ones filled in); throws on a wrong file. */
export function settingsFromFile(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('설정 파일을 읽을 수 없습니다.'); }
  if (data?.kind !== KIND || typeof data.settings !== 'object' || !data.settings) throw new Error('업무 캘린더 설정 파일이 아닙니다.');
  const picked = {};
  for (const k of Object.keys(DEFAULT_SETTINGS)) if (data.settings[k] !== undefined) picked[k] = data.settings[k];
  return mergeSettings(picked);
}

export function downloadSettings(s) {
  const d = new Date();
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const url = URL.createObjectURL(new Blob([settingsToFile(s)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `workcal-settings-${ymd}.json`; // ASCII: some browsers drop non-English download names
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
