// SS 12 — entry of the single site. One route tree: /login · /setup · /choose-role · /today · /workspace (report §20).
import React from 'react';
import { createRoot } from 'react-dom/client';
import Root from './shell/Root.jsx';
import './app.css';

createRoot(document.getElementById('root')).render(<React.StrictMode><Root /></React.StrictMode>);

// Offline shell (PWA) — production builds over http(s) only. Data that belongs to the organisation is never cached here.
if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production' && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
