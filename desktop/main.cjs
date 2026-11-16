const {
  app, BrowserWindow, Tray, Menu, ipcMain, shell, globalShortcut, screen, nativeImage, net, dialog, session,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const winDesktop = require('./winDesktop.cjs');

const ICON = path.join(__dirname, 'build', 'icon.png');

// ---------- small JSON config in the user data folder ----------
const configPath = () => path.join(app.getPath('userData'), 'config.json');
let config = {};
function loadConfig() {
  try { config = JSON.parse(fs.readFileSync(configPath(), 'utf8')); } catch { config = {}; }
  if (!config.serverUrl && process.env.WORKCAL_SERVER) config.serverUrl = process.env.WORKCAL_SERVER;
  config.cardBounds ||= {};
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
let collapsed = false;
const CHIP = 48; // collapsed window size (px)
let quitting = false;
let lastSettings = {};
const cardWins = new Map(); // key "note:<id>" | "countdown:<id>" → BrowserWindow

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
  if (!win || win.isDestroyed()) return;
  win.setSkipTaskbar(true); // re-applied: Windows can drop it after hide/show
  winDesktop.attachToDesktop(win);
}

/** All our desktop-layer windows (calendar + sticky notes / D-day cards). */
function desktopWindows() {
  return [mainWin, ...cardWins.values()].filter((w) => w && !w.isDestroyed());
}

/** Push every calendar window back under the other programs, unless the user is using one of them. */
function keepAtBottom() {
  const wins = desktopWindows();
  if (moveMode || wins.some((w) => w.isFocused())) return;
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
function defaultBounds() {
  const { workArea } = screen.getPrimaryDisplay();
  const width = Math.round(workArea.width * 0.66);
  const height = Math.round(workArea.height * 0.86);
  return { width, height, x: workArea.x + Math.round((workArea.width - width) / 2), y: workArea.y + Math.round(workArea.height * 0.05) };
}

function createMainWindow() {
  const b = config.bounds || defaultBounds();
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
  // Clicking the calendar must not lift it above other programs.
  mainWin.on('focus', () => winDesktop.sendToBottom(mainWin));
  const remember = () => {
    if (collapsed) return; // keep the expanded size
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
    width: 460, height: 340, resizable: false, title: '서버 주소 설정', icon: ICON, skipTaskbar: true,
    autoHideMenuBar: true, webPreferences: webPrefs,
  });
  setupWin.loadFile(path.join(__dirname, 'setup.html'), { query: { current: config.serverUrl || '' } });
  setupWin.on('closed', () => {
    setupWin = null;
    if (!config.serverUrl) app.quit();
  });
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
  const b = config.settingsBounds || (() => {
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

function cardKey(kind, id) { return `${kind}:${id}`; }

function openCard(kind, id, index) {
  const key = cardKey(kind, id);
  if (cardWins.has(key)) return;
  const { workArea } = screen.getPrimaryDisplay();
  const b = config.cardBounds[key] || {
    width: 240, height: kind === 'note' ? 220 : 150,
    x: workArea.x + workArea.width - 270 - Math.floor(index / 4) * 260,
    y: workArea.y + 30 + (index % 4) * 230,
  };
  const win = new BrowserWindow({
    ...b,
    frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false,
    skipTaskbar: true, resizable: true, minimizable: false, maximizable: false, fullscreenable: false,
    minWidth: 160, minHeight: 100, show: false, icon: ICON,
    type: process.platform === 'linux' ? 'desktop' : undefined,
    webPreferences: webPrefs,
  });
  lockNavigation(win);
  win.loadURL(`${config.serverUrl}/#/card/${kind}/${id}`);
  win.once('ready-to-show', () => {
    if (mainWin?.isVisible()) win.showInactive();
    pinToDesktop(win);
  });
  win.on('show', () => pinToDesktop(win));
  win.on('focus', () => winDesktop.sendToBottom(win));
  const remember = () => { config.cardBounds[key] = win.getBounds(); saveConfig(); };
  win.on('moved', remember);
  win.on('resized', remember);
  win.on('closed', () => cardWins.delete(key));
  cardWins.set(key, win);
}

function syncCards({ show, notes = [], countdowns = [] }) {
  const wanted = new Set();
  if (show) {
    countdowns.forEach((id) => wanted.add(cardKey('countdown', id)));
    notes.forEach((id) => wanted.add(cardKey('note', id)));
  }
  for (const [key, win] of cardWins) if (!wanted.has(key)) win.destroy();
  [...wanted].forEach((key, i) => {
    const [kind, id] = key.split(':');
    openCard(kind, id, i);
  });
}

function setVisible(visible) {
  if (!mainWin) return;
  if (visible) {
    mainWin.showInactive();
    cardWins.forEach((w) => w.showInactive());
  } else {
    mainWin.hide();
    cardWins.forEach((w) => w.hide());
  }
  updateTray();
}

/** 접기: shrink the calendar to a small square at its top-left corner (and back). */
function setCollapsed(on) {
  if (!mainWin || collapsed === on) return;
  if (on && moveMode) setMoveMode(false);
  const expanded = config.bounds || mainWin.getBounds();
  collapsed = on;
  if (on) {
    config.bounds = mainWin.getBounds();
    saveConfig();
    mainWin.setBounds({ x: expanded.x, y: expanded.y, width: CHIP, height: CHIP });
  } else {
    mainWin.setBounds(config.bounds || defaultBounds());
  }
}

function setMoveMode(on) {
  if (on && collapsed) return;
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
ipcMain.on('sync-cards', (_e, cards) => syncCards(cards));
ipcMain.on('open-settings', (_e, tab) => openSettings(tab));
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
