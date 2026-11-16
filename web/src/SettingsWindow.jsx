import { useEffect, useRef, useState } from 'react';
import { api } from './lib/api.js';
import { mergeSettings, migrateSettings } from './lib/settings.js';
import { desktop } from './lib/desktop.js';
import { SettingsDialog } from './components/SettingsDialog.jsx';
import { HelpDialog } from './components/SmallDialogs.jsx';

/**
 * Desktop app only: the settings screen in its own window, so it can be moved anywhere on the
 * screen. Every change is sent straight to the calendar window for a live preview, and saved.
 */
export default function SettingsWindow({ tab }) {
  const [s, setS] = useState(null);
  const [help, setHelp] = useState(false);
  const pending = useRef({});
  const timer = useRef(null);

  useEffect(() => {
    document.body.classList.add('settings-window-body');
    api.me().then((m) => setS(mergeSettings({ ...m.settings, ...(migrateSettings(m.settings) || {}) }))).catch(() => {});
  }, []);

  const flush = () => {
    clearTimeout(timer.current);
    const body = pending.current;
    pending.current = {};
    if (Object.keys(body).length) return api.saveSettings(body).catch(() => {});
    return Promise.resolve();
  };

  const update = (patch) => {
    setS((cur) => mergeSettings({ ...cur, ...patch }));
    desktop?.previewSettings(patch); // instant preview in the calendar window
    pending.current = { ...pending.current, ...patch };
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 400);
  };

  useEffect(() => {
    const onUnload = () => flush();
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, []);

  if (!s) return <div className="boot dark">설정을 불러오는 중…</div>;
  return (
    <>
      <SettingsDialog s={s} update={update} standalone initialTab={tab || 'calendar'}
        onClose={() => flush().then(() => window.close())} onOpenHelp={() => setHelp(true)} />
      {help && <HelpDialog onClose={() => setHelp(false)} />}
    </>
  );
}
