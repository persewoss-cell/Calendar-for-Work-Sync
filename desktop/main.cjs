const {
  app, BrowserWindow, Tray, Menu, ipcMain, shell, globalShortcut, screen, nativeImage, net,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const PROTOCOL = 'workcal';
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
let tray = null;
let moveMode = false;
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
  mainWin.once('ready-to-show', () => mainWin.showInactive());
  const remember = () => { config.bounds = mainWin.getBounds(); saveConfig(); };
  mainWin.on('moved', remember);
  mainWin.on('resized', remember);
  mainWin.on('close', (e) => {
    if (!quitting) { e.preventDefault(); mainWin.hide(); }
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
  win.once('ready-to-show', () => mainWin?.isVisible() && win.showInactive());
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

function setMoveMode(on) {
  moveMode = on;
  if (!mainWin) return;
  mainWin.setResizable(on);
  mainWin.setMovable(on);
  if (on) { mainWin.show(); mainWin.focus(); }
  mainWin.webContents.send('move-mode', on);
  updateTray();
}

// ---------- tray ----------
function updateTray() {
  if (!tray) return;
  const visible = Boolean(mainWin?.isVisible());
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: visible ? '캘린더 숨기기' : '캘린더 보이기', click: () => setVisible(!visible) },
    { label: moveMode ? '위치 및 크기 조정 끝내기' : '위치 및 크기', click: () => setMoveMode(!moveMode) },
    { label: '새로고침', click: () => mainWin?.reload() },
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

// ---------- login hand-off (system browser → workcal://auth?code=…) ----------
function handleProtocolUrl(url) {
  if (!url?.startsWith(`${PROTOCOL}://`)) return;
  const code = new URL(url).searchParams.get('code');
  if (code && mainWin) {
    mainWin.loadURL(`${config.serverUrl}/auth/complete?code=${encodeURIComponent(code)}`);
    mainWin.showInactive();
  }
}

// ---------- ipc ----------
ipcMain.on('login', () => shell.openExternal(`${config.serverUrl}/auth/google?client=desktop`));
ipcMain.on('change-server', openSetup);
ipcMain.on('quit', () => { quitting = true; app.quit(); });
ipcMain.on('hide', () => setVisible(false));
ipcMain.on('toggle-move', () => setMoveMode(!moveMode));
ipcMain.on('apply-settings', (_e, s) => applySettings(s));
ipcMain.on('sync-cards', (_e, cards) => syncCards(cards));
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
if (process.defaultApp && process.argv.length >= 2) {
  app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const url = argv.find((a) => a.startsWith(`${PROTOCOL}://`));
    if (url) handleProtocolUrl(url);
    else setVisible(true);
  });
  app.on('open-url', (e, url) => { e.preventDefault(); handleProtocolUrl(url); });

  app.whenReady().then(() => {
    loadConfig();
    createTray();
    if (config.serverUrl) createMainWindow();
    else openSetup();
    const startUrl = process.argv.find((a) => a.startsWith(`${PROTOCOL}://`));
    if (startUrl) setTimeout(() => handleProtocolUrl(startUrl), 1500);
  });
  app.on('window-all-closed', (e) => e.preventDefault?.());
  app.on('before-quit', () => { quitting = true; });
  app.on('will-quit', () => globalShortcut.unregisterAll());
}
