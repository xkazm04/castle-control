import { createRoot } from 'react-dom/client';
import '@castle-control/tokens';
import { DesktopApp } from './app.jsx';
import { createDesktopClient } from './client.js';

declare global {
  interface Window { __CASTLE_CONTROL_LAUNCH__?: unknown }
}

const root = document.getElementById('root');
if (!root) throw new Error('Desktop root missing');
try {
  // A browser-only preview defaults to the visibly isolated fixture source.
  // WP 0.5b injects the local endpoint and per-launch capability before this load.
  const launch = window.__CASTLE_CONTROL_LAUNCH__ ?? { mode: 'fixture' };
  delete window.__CASTLE_CONTROL_LAUNCH__;
  createRoot(root).render(<DesktopApp client={createDesktopClient(launch)} />);
} catch {
  root.textContent = 'Desktop launch unavailable. Reopen Castle Control from its desktop shell.';
}
