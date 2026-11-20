import test from 'node:test';
import assert from 'node:assert/strict';
import { availableKeys, shortcutLabel, splitShortcut } from './shortcuts.js';

test('Win + Shift does not offer S (Snipping Tool) or digits', () => {
  const keys = availableKeys('Shift+Meta');
  assert.ok(!keys.includes('S'));
  assert.ok(!keys.includes('1'));
  assert.ok(keys.includes('K'));
});

test('keys used by our other shortcuts are left out for the same modifiers only', () => {
  assert.ok(!availableKeys('Ctrl+Alt', ['Ctrl+Alt+H']).includes('H'));
  assert.ok(availableKeys('Alt+Shift', ['Ctrl+Alt+H']).includes('H'));
});

test('parsing and labels', () => {
  assert.deepEqual(splitShortcut('Alt+Ctrl+T'), { mod: 'Ctrl+Alt', key: 'T' });
  assert.equal(shortcutLabel('Alt+Meta+J'), 'Win + Alt + J');
});
