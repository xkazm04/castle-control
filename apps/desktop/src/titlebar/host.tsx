import { lazy, Suspense } from 'react';

const TitleBar = lazy(() => import('./titlebar.jsx'));

// Same runtime flag the official isTauri() reads; browser and fixture-in-Vite pages render nothing.
const native = () => {
  const runtime: object = globalThis;
  return 'isTauri' in runtime && runtime.isTauri === true;
};

export function TitleBarHost({ active = native() }: { active?: boolean }) {
  return active ? <Suspense fallback={null}><TitleBar /></Suspense> : null;
}
