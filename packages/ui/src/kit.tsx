import { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import '@castle-control/tokens';
import './kit.css';

// Keep the kit's specimen code and chrome behind one measured first-load boundary.
const KitTheme = lazy(() => import('../kit/theme.jsx'));
const root = document.getElementById('root');
if (!root) throw new Error('Kit root missing');
createRoot(root).render(<div id="kit"><Suspense fallback={<p>Loading simulated component kit…</p>}>
  <KitTheme initial_theme="paper" /><KitTheme initial_theme="stock" />
</Suspense></div>);
