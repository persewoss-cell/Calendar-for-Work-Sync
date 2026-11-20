import test from 'node:test';
import assert from 'node:assert/strict';
import { settingsFromFile, settingsToFile } from './settingsFile.js';
import { DEFAULT_SETTINGS, mergeSettings } from './settings.js';

test('settings survive export → import', () => {
  const s = mergeSettings({ opacity: 30, bgColor: '#123456', calText: { title: { size: 22, color: '#ffffff', bold: true } } });
  const back = settingsFromFile(settingsToFile(s));
  assert.equal(back.opacity, 30);
  assert.equal(back.bgColor, '#123456');
  assert.equal(back.calText.title.size, 22);
  assert.deepEqual(back.calText.today, DEFAULT_SETTINGS.calText.today);
});

test('unknown keys are dropped, wrong files rejected', () => {
  const text = JSON.stringify({ kind: 'workcal-settings', version: 1, settings: { opacity: 10, evil: 1 } });
  assert.equal(settingsFromFile(text).evil, undefined);
  assert.throws(() => settingsFromFile('{"a":1}'), /설정 파일이 아닙니다/);
  assert.throws(() => settingsFromFile('not json'), /읽을 수 없습니다/);
});
