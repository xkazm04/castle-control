import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/** One route visit, driven identically in the Tauri window and in Chrome on Vite. */
export type Step = { name: string; heading: string; hash: RegExp; act: (page: Page) => Promise<void> };

const heading = (page: Page, name: string) => page.getByRole('heading', { level: 1, name, exact: true });

async function toHash(page: Page, hash: string): Promise<void> {
  await page.evaluate(target => { if (location.hash !== target) location.hash = target; }, hash);
}

async function key(page: Page, value: string): Promise<void> {
  // The one keymap listens on .desktop-root; typing into a field suppresses it,
  // so press on the root itself, as a person does after clicking the window.
  await page.locator('.desktop-root').press(value);
}

// The Keep's own h1 follows the selected chamber after a return, so the Keep is
// identified by its labelled region; it still renders exactly one h1.
const keep: Step = { name: 'keep', heading: 'The keep', hash: /#\/keep$/, act: page => toHash(page, '#/keep') };
const rooms = [
  { n: '1', heading: 'The Lot Chamber', hash: /#\/chamber\/lottery$/ },
  { n: '2', heading: 'The Gatehouse', hash: /#\/chamber\/moderator$/ },
  { n: '3', heading: 'The Beacons', hash: /#\/chamber\/visuals$/ },
  { n: '4', heading: 'The Map Room', hash: /#\/chamber\/studio$/ },
] as const;

export const keepStep = keep;
export const roomSteps: Array<[Step, Step]> = rooms.map(room => [
  { name: `room-${room.n}`, heading: room.heading, hash: room.hash,
    act: async (page: Page) => { await settle(page, keep); await key(page, room.n); } },
  { name: `room-${room.n}-esc`, heading: keep.heading, hash: keep.hash, act: (page: Page) => key(page, 'Escape') },
]);
export const overviewStep: Step = { name: 'overview-key-0', heading: 'Preview and Proclaim', hash: /#\/overview$/,
  act: async page => { await settle(page, keep); await key(page, '0'); } };
export const streamStep: Step = { name: 'stream', heading: 'Set up OBS', hash: /#\/stream$/, act: page => toHash(page, '#/stream') };
export const demoStep: Step = { name: 'demo', heading: 'On stream', hash: /#\/demo$/, act: page => toHash(page, '#/demo') };

/** Navigate to a step's own state from wherever the page is. */
export async function settle(page: Page, step: Step): Promise<void> {
  await step.act(page);
  await expect(page).toHaveURL(step.hash, { timeout: 15_000 });
  if (step.heading === keep.heading) {
    await expect(page.getByRole('region', { name: keep.heading, exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.keep-home h1')).toHaveCount(1, { timeout: 15_000 });
  } else if (step.name === 'stream') {
    // The OBS setup page's h1 also carries its "Set up OBS" kicker.
    await expect(page.locator('.stream-workspace h1').first()).toContainText(step.heading, { timeout: 15_000 });
  } else {
    await expect(heading(page, step.heading).first()).toBeVisible({ timeout: 15_000 });
  }
  await expect(page.getByText('Opening the room...', { exact: true })).toHaveCount(0, { timeout: 15_000 });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

export async function visibleText(page: Page): Promise<string[]> {
  const text = await page.evaluate(() => document.body.innerText);
  return text.split('\n').map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

export type TextDiff = { tauri_lines: number; vite_lines: number; only_tauri: string[]; only_vite: string[];
  only_tauri_masked: string[]; only_vite_masked: string[] };

function minus(left: string[], right: string[]): string[] {
  const pool = new Map<string, number>();
  for (const line of right) pool.set(line, (pool.get(line) ?? 0) + 1);
  return left.filter(line => {
    const count = pool.get(line) ?? 0;
    if (count) pool.set(line, count - 1);
    return !count;
  });
}

/** Multiset line diff; the masked view replaces digits so clocks and counters do not count as differences. */
export function diffText(tauri: string[], vite: string[]): TextDiff {
  const mask = (lines: string[]) => lines.map(line => line.replace(/\d/g, '#'));
  return {
    tauri_lines: tauri.length, vite_lines: vite.length,
    only_tauri: minus(tauri, vite), only_vite: minus(vite, tauri),
    only_tauri_masked: minus(mask(tauri), mask(vite)), only_vite_masked: minus(mask(vite), mask(tauri)),
  };
}
