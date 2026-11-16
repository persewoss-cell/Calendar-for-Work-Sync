import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import CardWindow from './CardWindow.jsx';
import './styles/app.css';

// Offline cache for the browser / phone app only. The desktop app always loads the live server,
// and a stale service worker there could keep it from loading after a server update.
if (!window.workcalDesktop && 'serviceWorker' in navigator) {
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true })).catch(() => {});
}

const card = window.location.hash.match(/^#\/card\/(note|countdown)\/([a-f0-9]{24})$/);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {card ? <CardWindow kind={card[1]} id={card[2]} /> : <App />}
  </StrictMode>,
);
