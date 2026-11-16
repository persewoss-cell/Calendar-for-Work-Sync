import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import CardWindow from './CardWindow.jsx';
import './styles/app.css';

const card = window.location.hash.match(/^#\/card\/(note|countdown)\/([a-f0-9]{24})$/);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {card ? <CardWindow kind={card[1]} id={card[2]} /> : <App />}
  </StrictMode>,
);
