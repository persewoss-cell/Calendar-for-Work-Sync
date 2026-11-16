// Windows only: keep a window glued to the desktop.
//
// The window's owner is set to the desktop window (Progman, or the WorkerW that hosts the
// desktop icons). Windows that belong to the desktop stay visible when the user presses
// Win+D / "Show desktop", and never get a taskbar button. sendToBottom() keeps the window
// under every normal app window, like a desktop widget.

let api;

function load() {
  if (api !== undefined) return api;
  api = null;
  if (process.platform !== 'win32') return api;
  try {
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll');
    api = {
      FindWindowW: user32.func('intptr_t __stdcall FindWindowW(str16 cls, str16 name)'),
      FindWindowExW: user32.func('intptr_t __stdcall FindWindowExW(intptr_t parent, intptr_t after, str16 cls, str16 name)'),
      SetWindowLongPtrW: user32.func('intptr_t __stdcall SetWindowLongPtrW(intptr_t hwnd, int index, intptr_t value)'),
      SetWindowPos: user32.func('bool __stdcall SetWindowPos(intptr_t hwnd, intptr_t after, int x, int y, int cx, int cy, uint32_t flags)'),
      IsWindow: user32.func('bool __stdcall IsWindow(intptr_t hwnd)'),
      koffi,
    };
    // SetWinEventHook: tells us whenever another window comes to the foreground.
    api.WinEventProc = koffi.proto('void __stdcall WinEventProc(intptr_t hook, uint32_t event, intptr_t hwnd, int32_t idObject, int32_t idChild, uint32_t thread, uint32_t time)');
    api.SetWinEventHook = user32.func('intptr_t __stdcall SetWinEventHook(uint32_t eventMin, uint32_t eventMax, intptr_t hmod, WinEventProc *proc, uint32_t pid, uint32_t tid, uint32_t flags)');
    api.UnhookWinEvent = user32.func('bool __stdcall UnhookWinEvent(intptr_t hook)');
  } catch (err) {
    console.warn('[desktop] native desktop pinning unavailable:', err.message);
    api = null;
  }
  return api;
}

const GWLP_HWNDPARENT = -8;
const HWND_BOTTOM = 1;
const SWP_NOSIZE = 0x0001;
const SWP_NOMOVE = 0x0002;
const SWP_NOACTIVATE = 0x0010;

const isNull = (h) => !h || Number(h) === 0;

function hwndOf(win) {
  const buf = win.getNativeWindowHandle();
  return buf.length >= 8 ? buf.readBigInt64LE(0) : BigInt(buf.readInt32LE(0));
}

/** The window that hosts the desktop icons (Progman, or a WorkerW behind it). */
function desktopOwner(a) {
  const progman = a.FindWindowW('Progman', null);
  if (isNull(progman)) return null;
  if (!isNull(a.FindWindowExW(progman, 0, 'SHELLDLL_DefView', null))) return progman;
  let worker = 0;
  for (let i = 0; i < 64; i++) {
    worker = a.FindWindowExW(0, worker, 'WorkerW', null);
    if (isNull(worker)) break;
    if (!isNull(a.FindWindowExW(worker, 0, 'SHELLDLL_DefView', null))) return worker;
  }
  return progman;
}

/** Make `win` part of the desktop. Returns the owner handle, or null when unsupported. */
function attachToDesktop(win) {
  const a = load();
  if (!a || !win || win.isDestroyed()) return null;
  try {
    const owner = desktopOwner(a);
    if (isNull(owner)) return null;
    a.SetWindowLongPtrW(hwndOf(win), GWLP_HWNDPARENT, owner);
    sendToBottom(win);
    return owner;
  } catch (err) {
    console.warn('[desktop] attach failed:', err.message);
    return null;
  }
}

/** Put the window under all normal windows (just above the desktop icons). */
function sendToBottom(win) {
  const a = load();
  if (!a || !win || win.isDestroyed()) return;
  try {
    a.SetWindowPos(hwndOf(win), HWND_BOTTOM, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
  } catch (err) {
    console.warn('[desktop] sendToBottom failed:', err.message);
  }
}

/** True when the desktop window we attached to is gone (e.g. Explorer restarted). */
function ownerLost(owner) {
  const a = load();
  if (!a || isNull(owner)) return false;
  try {
    return !a.IsWindow(owner);
  } catch {
    return false;
  }
}

const EVENT_SYSTEM_FOREGROUND = 0x0003;
const EVENT_SYSTEM_MINIMIZEEND = 0x0017;
const WINEVENT_OUTOFCONTEXT = 0x0000;
const WINEVENT_SKIPOWNPROCESS = 0x0002;

let hook = null;
let hookCallback = null; // must stay referenced, or it is garbage-collected while Windows still calls it

/**
 * Call `onOtherWindow(hwnd)` whenever a window of another program becomes the foreground
 * window (e.g. an Explorer dialog popping up). Returns a function that stops watching.
 */
function watchForeground(onOtherWindow) {
  const a = load();
  if (!a || hook) return () => {};
  try {
    hookCallback = a.koffi.register((_hook, _event, hwnd) => {
      try { onOtherWindow(hwnd); } catch { /* never throw into Windows */ }
    }, a.koffi.pointer(a.WinEventProc));
    hook = a.SetWinEventHook(EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_MINIMIZEEND, 0, hookCallback, 0, 0,
      WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS);
    if (isNull(hook)) throw new Error('SetWinEventHook returned 0');
  } catch (err) {
    console.warn('[desktop] foreground watch unavailable:', err.message);
    hook = null;
  }
  return () => {
    if (!hook) return;
    try { a.UnhookWinEvent(hook); } catch { /* ignore */ }
    try { a.koffi.unregister(hookCallback); } catch { /* ignore */ }
    hook = null;
    hookCallback = null;
  };
}

module.exports = { attachToDesktop, sendToBottom, ownerLost, watchForeground, isSupported: () => Boolean(load()) };
