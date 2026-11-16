import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import SettingsWindow from './SettingsWindow.jsx';
import './styles/app.css';

// Offline cache for the browser / phone app only. The desktop app always loads the live server,
// and a stale service worker there could keep it from loading after a server update.
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
