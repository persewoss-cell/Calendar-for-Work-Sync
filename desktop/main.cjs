const {
  app, BrowserWindow, Tray, Menu, ipcMain, shell, globalShortcut, screen, nativeImage, net, dialog, session,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const winDesktop = require('./winDesktop.cjs');

const ICON = path.join(__dirname, 'build', 'icon.png');
// The calendar server. Used automatically on first run; 서버 주소 변경 in the tray can still change it.
const DEFAULT_SERVER = 'https://workcal-jrwm.onrender.com';

// ---------- small JSON config in the user data folder ----------
const configPath = () => path.join(app.getPath('userData'), 'config.json');
let config = {};
function loadConfig() {
  try { config = JSON.parse(fs.readFileSync(configPath(), 'utf8')); } catch { config = {}; }
  if (!config.serverUrl) config.serverUrl = process.env.WORKCAL_SERVER || DEFAULT_SERVER;
  delete config.cardBounds; // sticky notes / D-day card windows were removed
}
let saveTimer;
function saveConfig() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(path.dirname(configPath()), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify(config, null, 2));
  }, 300);
}

let mainWin = null;
let setupWin = null;
let settingsWin = null;
let tray = null;
let moveMode = false;
let loginMode = false; // the login screen is showing: a normal, opaque, front window with a taskbar button
let collapsed = false;
const CHIP = 48; // collapsed window size (px)
let quitting = false;
let lastSettings = {};

const serverOrigin = () => { try { return new URL(config.serverUrl).origin; } catch { return null; } };

const webPrefs = {
  preload: path.join(__dirname, 'preload.cjs'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
};

/** Keep navigation inside our server; open everything else in the real browser. */
function lockNavigation(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (new URL(url).origin !== serverOrigin()) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });
}

// ---------- desktop layer ----------
/** No taskbar button, survives Win+D, stays under normal app windows. */
function pinToDesktop(win) {
  if (!win || win.isDestroyed() || (win === mainWin && loginMode)) return;
  win.setSkipTaskbar(true); // re-applied: Windows can drop it after hide/show
  winDesktop.attachToDesktop(win);
}

/** Our desktop-layer windows. */
function desktopWindows() {
  return [mainWin].filter((w) => w && !w.isDestroyed());
}

/** Push every calendar window back under the other programs, unless the user is using one of them. */
function keepAtBottom() {
  const wins = desktopWindows();
  if (moveMode || loginMode || wins.some((w) => w.isFocused())) return;
  wins.forEach((w) => winDesktop.sendToBottom(w));
}

let stopWatching = null;
let bottomTimer = null;
function startKeepingAtBottom() {
  if (process.platform !== 'win32' || bottomTimer) return;
  // Another program came to the front (e.g. an Explorer dialog) → make sure we did not come along.
  stopWatching = winDesktop.watchForeground(() => setTimeout(keepAtBottom, 30));
  // Safety net in case an event is missed. Cheap: a no-op when we are already at the bottom.
  bottomTimer = setInterval(keepAtBottom, 1500);
}

// ---------- windows ----------
// ---------- keeping windows on a screen that exists (dual monitor → single) ----------
/** Enough of the window (its title bar area) lies on some connected screen to be seen and grabbed. */
function isOnScreen(b) {
  return screen.getAllDisplays().some(({ workArea: w }) => {
    const x1 = Math.max(b.x, w.x);
    const x2 = Math.min(b.x + b.width, w.x + w.width);
    const y1 = Math.max(b.y, w.y);
    const y2 = Math.min(b.y + Math.min(b.height, 60), w.y + w.height);
    return x2 - x1 >= Math.min(120, b.width) && y2 - y1 >= Math.min(30, b.height);
  });
}

/** The bounds to use now: the saved ones if they are visible, else the same size centred on the main screen. */
function visibleBounds(b) {
  if (!b) return defaultBounds();
  if (isOnScreen(b)) return b;
  const { workArea: w } = screen.getPrimaryDisplay();
  const width = Math.min(b.width, w.width);
  const height = Math.min(b.height, w.height);
  return { width, height, x: w.x + Math.round((w.width - width) / 2), y: w.y + Math.round((w.height - height) / 2) };
}

const sameBounds = (a, b) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

/**
 * Put the calendar where the user left it if that screen is connected, otherwise somewhere visible.
 * The user's own spot (config.bounds) is kept, so reconnecting the monitor brings it back there.
 */
function ensureOnScreen() {
  if (!mainWin || mainWin.isDestroyed() || moveMode || loginMode) return;
  const target = visibleBounds(config.bounds);
  const want = collapsed ? { x: target.x, y: target.y, width: CHIP, height: CHIP } : target;
  if (!sameBounds(mainWin.getBounds(), want)) mainWin.setBounds(want);
  if (settingsWin && !settingsWin.isDestroyed() && !isOnScreen(settingsWin.getBounds())) {
    settingsWin.setBounds(visibleBounds(settingsWin.getBounds()));
  }
}

let screenTimer;
function watchScreens() {
  const later = () => { clearTimeout(screenTimer); screenTimer = setTimeout(ensureOnScreen, 600); };
  screen.on('display-added', later);
  screen.on('display-removed', later);
  screen.on('display-metrics-changed', later);
}

/** Tray: bring the calendar to the middle of the main screen and remember that spot. */
function bringToCenter() {
  const { workArea: w } = screen.getPrimaryDisplay();
  const cur = config.bounds || defaultBounds();
  const width = Math.min(cur.width, w.width);
  const height = Math.min(cur.height, w.height);
  config.bounds = { width, height, x: w.x + Math.round((w.width - width) / 2), y: w.y + Math.round((w.height - height) / 2) };
  saveConfig();
  setVisible(true);
  ensureOnScreen();
}

function defaultBounds() {
  const { workArea } = screen.getPrimaryDisplay();
  const width = Math.round(workArea.width * 0.66);
  const height = Math.round(workArea.height * 0.86);
  return { width, height, x: workArea.x + Math.round((workArea.width - width) / 2), y: workArea.y + Math.round(workArea.height * 0.05) };
}

function createMainWindow() {
  const b = visibleBounds(config.bounds);
  mainWin = new BrowserWindow({
    ...b,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    title: '업무 캘린더',
    icon: ICON,
    // On Linux this keeps the window on the desktop layer, under normal windows.
    type: process.platform === 'linux' ? 'desktop' : undefined,
    webPreferences: webPrefs,
  });
  lockNavigation(mainWin);
  mainWin.loadURL(`${config.serverUrl}/`);
  mainWin.once('ready-to-show', () => {
    mainWin.showInactive();
    pinToDesktop(mainWin);
  });
  mainWin.on('show', () => pinToDesktop(mainWin));
  // Tell the page when the user clicks another program or the desktop, so open popups close.
  mainWin.on('blur', () => setTimeout(() => {
    if (mainWin && !mainWin.isDestroyed() && !mainWin.isFocused()) mainWin.webContents.send('window-blur');
  }, 150));
  // Clicking the calendar must not lift it above other programs.
  mainWin.on('focus', () => { if (!loginMode) winDesktop.sendToBottom(mainWin); });
  // The window can only be moved/resized by the user in 위치 및 크기 mode. Moves at other times come
  // from us or Windows (e.g. a monitor was unplugged) and must not replace the user's chosen spot.
  const remember = () => {
    if (collapsed || !moveMode) return;
    config.bounds = mainWin.getBounds();
    saveConfig();
  };
  mainWin.on('moved', remember);
  mainWin.on('resized', remember);
  mainWin.on('close', (e) => {
    if (!quitting) { e.preventDefault(); mainWin.hide(); }
  });
  // Windows owned by the desktop are destroyed when Explorer restarts — come back.
  mainWin.on('closed', () => {
    mainWin = null;
    collapsed = false;
    if (!quitting) setTimeout(() => { if (!mainWin && !quitting) createMainWindow(); }, 3000);
  });
  mainWin.webContents.on('did-fail-load', (_e, code, desc, url) => {
    if (url.startsWith(config.serverUrl)) setTimeout(() => mainWin?.loadURL(`${config.serverUrl}/`), 10000);
  });
}

function openSetup() {
  if (setupWin) return setupWin.focus();
  setupWin = new BrowserWindow({
    width: 460, height: 340, resizable: false, title: '서버 주소 설정', icon: ICON,
    autoHideMenuBar: true, webPreferences: webPrefs,
  });
  setupWin.loadFile(path.join(__dirname, 'setup.html'), { query: { current: config.serverUrl || '' } });
  setupWin.on('closed', () => {
    setupWin = null;
    if (!config.serverUrl) app.quit();
  });
}

/**
 * Login screen: take the calendar off the desktop layer so it shows on the taskbar, comes to the
 * front and can't hide behind other windows; after login, put it back where the user keeps it.
 */
function setLoginMode(on) {
  if (!mainWin || mainWin.isDestroyed() || loginMode === on) return;
  loginMode = on;
  if (on) {
    if (moveMode) setMoveMode(false);
    winDesktop.detachFromDesktop(mainWin);
    mainWin.setSkipTaskbar(false);
    mainWin.setTitle('업무 캘린더 - 로그인');
    const { workArea: w } = screen.getPrimaryDisplay();
    const width = Math.min(480, w.width);
    const height = Math.min(640, w.height);
    mainWin.setBounds({ width, height, x: w.x + Math.round((w.width - width) / 2), y: w.y + Math.round((w.height - height) / 2) });
    mainWin.show();
    mainWin.moveTop();
    mainWin.focus();
  } else {
    mainWin.setTitle('업무 캘린더');
    const here = visibleBounds(config.bounds);
    mainWin.setBounds(collapsed ? { x: here.x, y: here.y, width: CHIP, height: CHIP } : here);
    pinToDesktop(mainWin);
    winDesktop.sendToBottom(mainWin);
  }
  updateTray();
}

/** 캘린더 설정 in its own window, so it can be moved anywhere on screen (not clipped by the calendar). */
function openSettings(tab = 'calendar') {
  const url = `${config.serverUrl}/#/settings/${encodeURIComponent(tab)}`;
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.loadURL(url);
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  const b = (config.settingsBounds && visibleBounds(config.settingsBounds)) || (() => {
    const { workArea } = screen.getPrimaryDisplay();
    return { width: 840, height: 680, x: workArea.x + Math.round((workArea.width - 840) / 2), y: workArea.y + Math.round((workArea.height - 680) / 2) };
  })();
  settingsWin = new BrowserWindow({
    ...b, minWidth: 620, minHeight: 460, frame: false, skipTaskbar: true, show: false,
    backgroundColor: '#d4d9e0', title: '캘린더 설정', icon: ICON, webPreferences: webPrefs,
  });
  lockNavigation(settingsWin);
  settingsWin.loadURL(url);
  settingsWin.once('ready-to-show', () => settingsWin.show());
  const remember = () => { config.settingsBounds = settingsWin.getBounds(); saveConfig(); };
  settingsWin.on('moved', remember);
  settingsWin.on('resized', remember);
  settingsWin.on('closed', () => { settingsWin = null; });
}

function setVisible(visible) {
  if (!mainWin) return;
  if (visible) {
    mainWin.showInactive();
  } else {
    mainWin.hide();
  }
  updateTray();
}

/** 접기: shrink the calendar to a small square at its top-left corner (and back). */
function setCollapsed(on) {
  if (!mainWin || collapsed === on || loginMode) return;
  if (on && moveMode) setMoveMode(false);
  const here = visibleBounds(config.bounds); // where the calendar is shown on the current screens
  collapsed = on;
  if (on) mainWin.setBounds({ x: here.x, y: here.y, width: CHIP, height: CHIP });
  else mainWin.setBounds(here);
}

function setMoveMode(on) {
  if (on && collapsed) return;
  // Leaving 위치 및 크기: the current spot becomes the user's spot (the 'moved' event alone is not
  // sent on every platform).
  if (!on && moveMode && mainWin && !mainWin.isDestroyed()) {
    config.bounds = mainWin.getBounds();
    saveConfig();
  }
  moveMode = on;
  if (!mainWin) return;
  mainWin.setResizable(on);
  mainWin.setMovable(on);
  if (on) { mainWin.show(); mainWin.focus(); }
  mainWin.webContents.send('move-mode', on);
  updateTray();
}

// ---------- auto update (GitHub Releases) ----------
let updater = null;
let updateState = 'idle'; // idle | checking | downloading | ready
function getUpdater() {
  if (updater || !app.isPackaged) return updater;
  try {
    ({ autoUpdater: updater } = require('electron-updater'));
  } catch (err) {
    console.warn('electron-updater unavailable', err.message);
    return null;
  }
  updater.autoDownload = false; // ask first
  updater.autoInstallOnAppQuit = true;
  updater.on('update-available', async (info) => {
    const { response } = await dialog.showMessageBox(mainWin, {
      type: 'info',
      title: '업무 캘린더 업데이트',
      message: `새 버전 ${info.version}이(가) 있습니다.`,
      detail: `지금 버전: ${app.getVersion()}\n\n「업데이트」를 누르면 자동으로 받아서 설치하고 다시 시작합니다.`,
      buttons: ['업데이트', '나중에'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (response !== 0) { updateState = 'idle'; return; }
    updateState = 'downloading';
    tray?.setToolTip('업무 캘린더 — 업데이트 받는 중…');
    updater.downloadUpdate().catch((err) => {
      updateState = 'idle';
      dialog.showErrorBox('업데이트 실패', `업데이트 파일을 받지 못했습니다.\n${err.message}`);
    });
  });
  updater.on('update-not-available', () => { updateState = 'idle'; });
  updater.on('download-progress', (p) => {
    tray?.setToolTip(`업무 캘린더 — 업데이트 받는 중 ${Math.round(p.percent)}%`);
    mainWin?.setProgressBar(p.percent / 100);
  });
  updater.on('update-downloaded', () => {
    updateState = 'ready';
    mainWin?.setProgressBar(-1);
    quitting = true;
    // Silent install, then start the new version.
    setImmediate(() => updater.quitAndInstall(true, true));
  });
  updater.on('error', (err) => {
    updateState = 'idle';
    mainWin?.setProgressBar(-1);
    tray?.setToolTip('업무 캘린더');
    console.warn('update error', err?.message);
  });
  return updater;
}

function checkForUpdates(manual = false) {
  const u = getUpdater();
  if (!u) {
    if (manual) dialog.showMessageBox(mainWin, { message: '개발 실행 중에는 업데이트를 확인하지 않습니다.' });
    return;
  }
  if (updateState !== 'idle') return;
  updateState = 'checking';
  u.checkForUpdates()
    .then((r) => {
      if (manual && (!r || !r.isUpdateAvailable)) {
        dialog.showMessageBox(mainWin, { type: 'info', message: `최신 버전(${app.getVersion()})을 쓰고 있습니다.` });
      }
    })
    .catch((err) => {
      updateState = 'idle';
      if (manual) dialog.showErrorBox('업데이트 확인 실패', err.message);
    });
}

// ---------- tray ----------
function updateTray() {
  if (!tray) return;
  const visible = Boolean(mainWin?.isVisible());
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: visible ? '캘린더 숨기기' : '캘린더 보이기', click: () => setVisible(!visible) },
    { label: moveMode ? '위치 및 크기 조정 끝내기' : '위치 및 크기', click: () => setMoveMode(!moveMode) },
    { label: '화면 가운데로 가져오기', click: bringToCenter },
    { label: '새로고침', click: () => mainWin?.reload() },
    { label: `업데이트 확인 (현재 ${app.getVersion()})`, click: () => checkForUpdates(true) },
    { type: 'separator' },
    { label: '서버 주소 변경', click: openSetup },
    { label: 'Windows 시작 시 실행', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked }) },
    { type: 'separator' },
    { label: '종료', click: () => { quitting = true; app.quit(); } },
  ]));
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
  tray.setToolTip('업무 캘린더');
  tray.on('click', () => setVisible(!mainWin?.isVisible()));
  updateTray();
}

// ---------- settings from the web app ----------
function toAccelerator(keys) {
  return keys.split('+').map((k) => ({ Ctrl: 'CommandOrControl', Meta: 'Super' }[k] || k)).join('+');
}

function applySettings(s) {
  const prev = JSON.stringify(lastSettings.shortcuts || {});
  lastSettings = s;
  if (typeof s.autoUpdate === 'boolean' && config.autoUpdate !== s.autoUpdate) {
    config.autoUpdate = s.autoUpdate;
    saveConfig();
  }
  if (app.isPackaged && typeof s.autoLaunch === 'boolean' && app.getLoginItemSettings().openAtLogin !== s.autoLaunch) {
    app.setLoginItemSettings({ openAtLogin: s.autoLaunch });
  }
  if (process.platform === 'win32' && typeof mainWin?.setBackgroundMaterial === 'function') {
    try { mainWin.setBackgroundMaterial(s.glass ? 'acrylic' : 'none'); } catch { /* older Windows */ }
  }
  if (JSON.stringify(s.shortcuts || {}) === prev) return;
  globalShortcut.unregisterAll();
  for (const [name, sc] of Object.entries(s.shortcuts || {})) {
    if (!sc?.enabled || name === 'finishEdit') continue;
    try {
      globalShortcut.register(toAccelerator(sc.keys), () => {
        if (name === 'hideCalendar') setVisible(!mainWin?.isVisible());
        else mainWin?.webContents.send('shortcut', name);
      });
    } catch (err) {
      console.warn('shortcut failed', sc.keys, err.message);
    }
  }
}

// ---------- ipc ----------
ipcMain.on('change-server', openSetup);
ipcMain.on('quit', () => { quitting = true; app.quit(); });
ipcMain.on('hide', () => setVisible(false));
ipcMain.on('toggle-move', () => setMoveMode(!moveMode));
ipcMain.on('set-collapsed', (_e, on) => setCollapsed(Boolean(on)));
ipcMain.on('apply-settings', (_e, s) => applySettings(s));
ipcMain.on('open-settings', (_e, tab) => openSettings(tab));
ipcMain.on('login-mode', (_e, on) => setLoginMode(Boolean(on)));
ipcMain.on('activate-window', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w || w.isDestroyed() || w.isFocused()) return;
  w.focus(); // take keyboard input; the 'focus' handler then puts the calendar back under other windows
  if (w === mainWin && !loginMode) winDesktop.sendToBottom(w);
});
ipcMain.on('settings-preview', (_e, patch) => mainWin?.webContents.send('settings-preview', patch));
ipcMain.handle('save-server', async (_e, url) => {
  try {
    const res = await net.fetch(`${url}/healthz`);
    if (!res.ok) return false;
  } catch {
    return false;
  }
  const changed = config.serverUrl !== url;
  config.serverUrl = url;
  saveConfig();
  setupWin?.close();
  if (!mainWin) createMainWindow();
  else if (changed) mainWin.loadURL(`${url}/`);
  return true;
});

// ---------- app lifecycle ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => setVisible(true));

  app.whenReady().then(async () => {
    // The desktop app always loads the live server; drop any service worker left from older versions.
    await session.defaultSession.clearStorageData({ storages: ['serviceworkers', 'cachestorage'] }).catch(() => {});
    loadConfig();
    createTray();
    watchScreens();
    if (config.serverUrl) createMainWindow();
    else openSetup();
    // 「자동 업데이트 확인」 setting (remembered from the web app's settings).
    if (config.autoUpdate !== false) setTimeout(() => checkForUpdates(false), 5000);
    startKeepingAtBottom();
  });
  app.on('window-all-closed', (e) => e.preventDefault?.());
  app.on('before-quit', () => { quitting = true; });
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    clearInterval(bottomTimer);
    stopWatching?.();
  });
}
