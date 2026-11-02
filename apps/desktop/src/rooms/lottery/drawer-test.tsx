import { renderToReadableStream, renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { lotDrawer } from './drawer.js';

/** SSR probes the real detail layer in its open state; chamber.test verifies the trigger wiring. */
export function withLotDrawer<T>(owner: object, inspect: () => T): T {
  const drawer = lotDrawer(owner);
  drawer.open();
  try { return inspect(); } finally { drawer.close(); }
}
export const renderLotDrawer = (owner: object, room: ReactNode) =>
  withLotDrawer(owner, () => renderToStaticMarkup(room));

export async function readLotDrawer(owner: object, room: ReactNode) {
  const drawer = lotDrawer(owner);
  drawer.open();
  try {
    const stream = await renderToReadableStream(room);
    await stream.allReady;
    return await new Response(stream).text();
  } finally { drawer.close(); }
}
