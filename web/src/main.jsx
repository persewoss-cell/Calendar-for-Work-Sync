import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import SettingsWindow from './SettingsWindow.jsx';
import './styles/app.css';

// Keep the app itself on the phone/browser (service worker) so it opens at once even while the free
// server is waking up. The desktop app keeps its own copy instead (desktop/main.cjs), because
// service workers are unreliable inside Electron.
if (!window.workcalDesktop && 'serviceWorker' in navigator) {
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true })).catch(() => {});
}

// Sticky notes / D-day card windows were removed; an older PC app may still open one — just close it.
function ClosedCard() {
  window.close();
  return null;
}

const card = window.location.hash.match(/^#\/card\/(note|countdown)\/([a-f0-9]{24})$/);
const settings = window.location.hash.match(/^#\/settings(?:\/(\w+))?$/);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {card ? <ClosedCard /> : settings ? <SettingsWindow tab={settings[1]} /> : <App />}
  </StrictMode>,
);
