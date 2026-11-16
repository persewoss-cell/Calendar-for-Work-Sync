const { contextBridge, ipcRenderer } = require('electron');

// Exposed to the web app as window.workcalDesktop (see web/src/lib/desktop.js).
contextBridge.exposeInMainWorld('workcalDesktop', {
  changeServer: () => ipcRenderer.send('change-server'),
  quit: () => ipcRenderer.send('quit'),
  hide: () => ipcRenderer.send('hide'),
  toggleMoveResize: () => ipcRenderer.send('toggle-move'),
  setCollapsed: (on) => ipcRenderer.send('set-collapsed', Boolean(on)),
  applySettings: (settings) => ipcRenderer.send('apply-settings', JSON.parse(JSON.stringify(settings))),
  syncCards: (cards) => ipcRenderer.send('sync-cards', cards),
  openSettings: (tab) => ipcRenderer.send('open-settings', String(tab || 'calendar')),
  previewSettings: (patch) => ipcRenderer.send('settings-preview', JSON.parse(JSON.stringify(patch))),
  onSettingsPreview: (cb) => {
    const handler = (_e, patch) => cb(patch);
    ipcRenderer.on('settings-preview', handler);
    return () => ipcRenderer.removeListener('settings-preview', handler);
  },
  onShortcut: (cb) => {
    const handler = (_e, name) => cb(name);
    ipcRenderer.on('shortcut', handler);
    return () => ipcRenderer.removeListener('shortcut', handler);
  },
});

contextBridge.exposeInMainWorld('workcalSetup', {
  save: (url) => ipcRenderer.invoke('save-server', url),
});

ipcRenderer.on('move-mode', (_e, on) => {
  document.body.classList.toggle('move-mode', on);
  let bar = document.getElementById('move-mode-bar');
  if (on && !bar) {
    bar = document.createElement('div');
    bar.id = 'move-mode-bar';
    bar.innerHTML = '창을 끌어서 옮기고, 가장자리를 끌어 크기를 바꾸세요. <button>완료</button>';
    bar.querySelector('button').onclick = () => ipcRenderer.send('toggle-move');
    document.body.appendChild(bar);
  } else if (!on && bar) {
    bar.remove();
  }
});

window.addEventListener('DOMContentLoaded', () => {
  document.body.classList.add('desktop-shell');
  const style = document.createElement('style');
  style.textContent = `
    body.move-mode .app { outline: 2px dashed rgba(255,255,255,.9); outline-offset: -2px; -webkit-app-region: drag; }
    body.move-mode .app * { pointer-events: none; }
    #move-mode-bar { position: fixed; left: 50%; top: 50%; transform: translate(-50%,-50%); z-index: 9999;
      background: rgba(10,30,60,.85); color: #fff; padding: 12px 16px; border-radius: 10px; font: 14px 'Malgun Gothic', sans-serif;
      -webkit-app-region: no-drag; display: flex; gap: 10px; align-items: center; }
    #move-mode-bar button { -webkit-app-region: no-drag; pointer-events: auto; background: #ffca28; border: 0; border-radius: 6px; padding: 5px 12px; font-weight: 700; cursor: pointer; }
  `;
  document.head.appendChild(style);
});
