// Global shortcuts for the PC app, chosen from two lists: a modifier combination and a key.
// Combinations that Windows itself or very common programs (browsers, Office, 한글) already use
// are left out of the key list, so a chosen shortcut doesn't take a key away from them.
// Saved as text such as 'Ctrl+Alt+T' (Meta = the Windows key).

export const MODIFIERS = [
  { value: 'Ctrl+Alt', label: 'Ctrl + Alt' },
  { value: 'Ctrl+Alt+Shift', label: 'Ctrl + Alt + Shift' },
  { value: 'Alt+Shift', label: 'Alt + Shift' },
  { value: 'Ctrl+Shift', label: 'Ctrl + Shift' },
  { value: 'Alt+Meta', label: 'Win + Alt' },
  { value: 'Shift+Meta', label: 'Win + Shift' },
  { value: 'Ctrl+Meta', label: 'Win + Ctrl' },
];

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const DIGITS = '1234567890'.split('');
const SYMBOLS = ['`', '-', '=', '[', ']', '\\', ';', "'", ',', '.', '/'];
const FKEYS = Array.from({ length: 12 }, (_, i) => `F${i + 1}`);

export const KEYS = [...LETTERS, ...DIGITS, ...SYMBOLS, ...FKEYS];

const list = (s) => s.split(' ');

/** Keys already taken for each modifier combination. */
const TAKEN = {
  // Graphics drivers (rotate screen) and Windows' own Ctrl+Alt+Del / Ctrl+Alt+Tab are not offered anyway.
  'Ctrl+Alt': list('Delete Tab'),
  'Ctrl+Alt+Shift': [],
  // Word / 한글: date, time, outline, marks …
  'Alt+Shift': list('A C D E I K L M N O P R T X F4 F10'),
  // Browsers, Office, Windows input language (Ctrl+Shift+digits) …
  'Ctrl+Shift': [...list('A B C D E F G H I J K L M N O P Q R S T U V W Y Z F5 F12 = -'), ...DIGITS],
  // Game Bar (record, screenshot, mic …), taskbar jump lists
  'Alt+Meta': [...list('B D G H K M R T F4'), ...DIGITS],
  // Snipping Tool, screen recording, restore windows, Copilot …
  'Shift+Meta': [...list('A C M R S T V F4'), ...DIGITS],
  // Virtual desktops, colour filters, Quick Assist, sound output, narrator …
  'Ctrl+Meta': [...list('C D F H N O Q S T V F4'), ...DIGITS],
};

export function splitShortcut(keys) {
  const parts = String(keys || '').split('+').filter(Boolean);
  const key = parts.pop() || '';
  const order = ['Ctrl', 'Alt', 'Shift', 'Meta'];
  const mod = order.filter((m) => parts.includes(m)).join('+');
  return { mod, key };
}

/** Keys that can be picked with `mod`, leaving out ones others already use (incl. our own shortcuts). */
export function availableKeys(mod, used = []) {
  const taken = new Set(TAKEN[mod] || []);
  for (const u of used) {
    const { mod: m, key } = splitShortcut(u);
    if (m === mod) taken.add(key);
  }
  return KEYS.filter((k) => !taken.has(k));
}

export const modifierLabel = (mod) => MODIFIERS.find((m) => m.value === mod)?.label || mod.replace(/Meta/g, 'Win').replace(/\+/g, ' + ');
export const shortcutLabel = (keys) => { const { mod, key } = splitShortcut(keys); return mod ? `${modifierLabel(mod)} + ${key}` : key; };
