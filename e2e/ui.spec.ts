import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { repo, routes, slug, stewardStates, themes } from './inventory.ts';
import { guardPage } from './network.ts';
import { startOverlay, visualId } from './overlay-server.ts';
import { auditFields, auditStyles, desktopSurfaces } from './styles.ts';
import { castSample } from './lots-steward.ts';

const diagnostics = new WeakMap<Page, () => void>();
let overlay: Awaited<ReturnType<typeof startOverlay>>;
test.beforeAll(async () => { overlay = await startOverlay(); });
test.afterAll(async () => { await overlay?.close(); });
test.beforeEach(async ({ page }) => { diagnostics.set(page, await guardPage(page)); });
test.afterEach(async ({ page }, info) => {
  const directory = join(repo, 'e2e/screenshots', info.project.name);
  await mkdir(directory, { recursive: true });
  const verify = diagnostics.get(page);
  if (!verify) throw new Error('Missing diagnostic guard');
  try {
    await page.screenshot({ path: join(directory, `${slug(info.title)}.png`), fullPage: true,
      animations: 'disabled', caret: 'hide' });
  } finally {
    // Stop active SSE/HMR before checking the complete page's diagnostics.
    await page.goto('about:blank');
    verify();
  }
});

test.describe('room bar and shell defaults', () => {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    test(`room bar fits one row at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/#/keep');
      await expect(page.locator('.cc-frame')).toHaveAttribute('data-theme', 'night');
      await expect(page.locator('.keep-home')).toBeVisible();
      for (const key of ['0', '1', '2', '3', '4']) {
        await page.keyboard.press(key);
        const bar = page.locator('[data-role="room-bar"]');
        await expect(bar.locator('[data-role="room-tab"]')).toHaveCount(5);
        await expect(bar.locator('[aria-current="page"] .cc-kbd')).toHaveText(key);
        await expect.poll(() => bar.evaluate(element => {
          const tabs = [...element.querySelectorAll('[data-role="room-tab"]')];
          const tops = tabs.map(tab => tab.getBoundingClientRect().top);
          const issues: string[] = [];
          if (Math.max(...tops) - Math.min(...tops) > 1) issues.push('tabs wrapped');
          for (const tab of tabs) {
            const bounds = tab.getBoundingClientRect();
            if (bounds.left < 0 || bounds.right > innerWidth) issues.push('tab leaves viewport');
            const title = tab.querySelector('.cc-chamber-tile-title');
            if (!title || title.scrollWidth > title.clientWidth + 1) issues.push('title clipped');
            for (const selector of ['.cc-chamber-tile-title', '.cc-chamber-state']) {
              const label = tab.querySelector(selector);
              if (!label?.firstChild) { issues.push('missing label'); continue; }
              const range = document.createRange(); range.selectNodeContents(label);
              const text = range.getBoundingClientRect();
              const box = label.getBoundingClientRect();
              if (text.right > box.right + 1 || text.left < box.left - 1) issues.push('tab text clipped');
            }
          }
          if (document.documentElement.scrollWidth > innerWidth) issues.push('horizontal scroll');
          return issues;
        })).toEqual([]);
      }
      await page.keyboard.press('Escape');
      await expect(page).toHaveURL(/#\/keep$/);
      await page.getByRole('button', { name: 'Toggle day and night' }).click();
      await expect(page.locator('.cc-frame')).toHaveAttribute('data-theme', 'day');
      await auditStyles(page, desktopSurfaces);
    });
  }
});

test.describe('surface cross-fade', () => {
  test.use({ reducedMotion: 'no-preference' });
  test('1 to 2 fades an inert out-copy without translating or delaying the route', async ({ page }) => {
    await page.goto('/#/chamber/lottery');
    await expect(page.locator('.lottery-room')).toBeVisible();
    // Dispatch through the same React keymap and sample in its next frame, before
    // the 170 ms out-copy can finish on a slow test-worker round trip.
    const motion = await page.evaluate(async () => {
      const root = document.querySelector('.desktop-root');
      if (!root) throw new Error('Missing shell root');
      root.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }));
      await new Promise<void>(resolve => requestAnimationFrame(() => { resolve(); }));
      return document.getAnimations().filter(animation => {
        const target = animation.effect instanceof KeyframeEffect ? animation.effect.target : null;
        return target instanceof HTMLElement && target.matches('main.desktop-surface');
      }).map(animation => ({
        frames: animation.effect instanceof KeyframeEffect ? animation.effect.getKeyframes() : [],
        duration: animation.effect?.getTiming().duration,
      }));
    });
    await expect(page).toHaveURL(/#\/chamber\/moderator$/);
    expect(motion.map(animation => animation.duration)).toEqual(expect.arrayContaining([170, 420]));
    for (const animation of motion) for (const frame of animation.frames) {
      expect(frame).toHaveProperty('opacity'); expect(frame).not.toHaveProperty('transform');
    }
    await expect(page.locator('.cc-surface-out')).toHaveCount(0);
    await expect(page.locator('[data-role="room-title"]')).toHaveCount(1);
  });
});

test('fixture OBS setup from Keep sizes a source and requires a hold before simulated add', async ({ page }) => {
  const rpc: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname === '/rpc') rpc.push(request.url()); });
  await page.goto('/#/keep');
  await page.getByRole('button', { name: 'Set up OBS', exact: true }).click();
  await expect(page).toHaveURL(/#\/stream$/);
  await page.getByRole('combobox', { name: 'Source size' }).selectOption('720p');
  await expect(page.getByText('1280 × 720', { exact: true }).first()).toBeVisible();
  const row = page.getByRole('article', { name: 'Offering altar', exact: true });
  const hold = row.getByRole('button', { name: 'Hold to seal and proclaim', exact: true });
  await row.getByRole('heading', { name: 'Offering altar' }).click();
  await hold.click();
  await expect(row).not.toContainText('no OBS source was created');
  await hold.focus();
  await page.keyboard.down('Space');
  try { await expect(row).toContainText('Simulated · no OBS source was created'); }
  finally { await page.keyboard.up('Space'); }
  await expect(page.getByText('SIMULATED', { exact: true })).toBeVisible();
  expect(rpc).toEqual([]);
  await auditStyles(page, desktopSurfaces);
  await auditFields(page);
});

for (const route of routes) for (const theme of themes) for (const steward of stewardStates) {
  test(`desktop-${slug(route)}-${theme}-steward-${steward}`, async ({ page }) => {
    // main.tsx defaults to fixtures when no native launch is injected.
    await page.goto(`/${route}`);
    await expect(page.locator('.cc-rampart > [data-stamp="simulated"]')).toHaveText('Simulated');
    await expect(page.locator('.keep-home, .overview-workspace, .shell-room, .demo-workspace, .stream-workspace, .rehearsal-workspace')).toBeVisible();
    await expect(page.getByText('Opening the room...', { exact: true })).toHaveCount(0);
    // The Keep is the one surface without a Steward: no dock, no talk field, no rampart button.
    const keep = route === '#/keep';
    if (keep) await expect(page.locator('.cc-steward-dock')).toHaveCount(0);
    else await expect(page.locator('.cc-steward-dock')).toBeVisible();
    if (route.endsWith('/drill')) await expect(page.locator('.moderator-drill')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
    if (await page.locator('.cc-frame').getAttribute('data-theme') !== theme) await page.getByRole('button', { name: 'Toggle day and night' }).click();
    await expect(page.locator('.cc-frame')).toHaveAttribute('data-theme', theme);
    if (steward === 'open' && keep) {
      // Nothing to open: `/` is left alone on the Keep, so focus does not move and the page stays put.
      await expect(page.getByRole('button', { name: 'Steward', exact: true })).toHaveCount(0);
      await page.keyboard.press('/');
      await expect(page.getByRole('textbox', { name: 'Talk to the Steward...' })).toHaveCount(0);
      await expect(page).toHaveURL(/#\/keep$/);
    } else if (steward === 'open') {
      // Steward is a persistent panel in this shell. Open means focused controls;
      // Overview additionally exposes its existing Talkback tab, with no LLM call.
      await page.getByRole('button', { name: 'Steward', exact: true }).click();
      await expect(page.getByRole('textbox', { name: 'Talk to the Steward...' })).toBeFocused();
      const talkback = page.getByRole('tab', { name: 'Talkback', exact: true });
      if (await talkback.count()) {
        await talkback.click();
        await expect(talkback).toHaveAttribute('aria-selected', 'true');
      }
      await expect(page.getByRole('region', { name: 'The Steward', exact: true })).toBeVisible();
    }
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await auditStyles(page, desktopSurfaces);
    // The Keep has no fields at all now (the Steward's talk prompt was its only one); the audit refuses an empty inventory.
    if (!keep) await auditFields(page);
  });
}

test('overlay-simulated-connected', async ({ page }) => {
  const before = overlay.pushes();
  await page.goto(`${overlay.url}/beacons/${visualId}`);
  await expect(page.locator('#scene')).toContainText('SIMULATED');
  const badge = page.locator('[data-simulated-badge]');
  await expect(badge).toBeVisible();
  await expect(badge).toHaveText('SIMULATED');
  await expect(page.locator('#scene')).toHaveAttribute('data-simulated', 'true');
  await expect(page.locator('#scene')).toHaveAttribute('data-intensity', '0.75');
  expect(overlay.pushes() - before, 'Walked simulated SSE connections').toBeGreaterThan(0);
  // OBS composites this canvas over a scene. Only this test permits transparency;
  // token font/ink, explicit white backgrounds and all other audits stay strict.
  await auditStyles(page, [
    { name: 'overlay canvas', selector: '#scene' },
    { name: 'simulated rendered layer', selector: '#scene > div' },
    { name: 'simulated provenance badge', selector: '[data-simulated-badge]' },
  ], { canvas: 'obs-transparent', tokenSheet: 'overlay-base' });
});

test('fixture draw rehearsal seals, casts, reveals in the urn and recomputes this cast', async ({ page }) => {
  await page.goto('/#/chamber/lottery');
  await expect(page.locator('.cc-rampart > [data-stamp="simulated"]')).toHaveText('Simulated');
  // Cast the lots seals the sample draw first, then casts, from one hold in the Steward's sheet.
  await castSample(page);
  const result = page.getByRole('region', { name: 'Current SIMULATED cast', exact: true });
  await expect(result.locator('[data-current-winner]')).toHaveCount(3);
  // This lane uses reduced motion, so every winner is revealed immediately.
  for (const order of [1, 2, 3]) await expect(page.locator(`.lottery-draw-lots [data-winner="${order}"]`)).toHaveCount(1);
  const winners = (await result.locator('[data-current-winner] span').allTextContents());
  // The stage's scoreboard lists the same winners in cast order.
  for (const [index, winner] of winners.entries()) await expect(page.locator(`[data-stage-winner="${index + 1}"]`)).toContainText(winner);
  await result.getByRole('button', { name: 'Read current simulated writ', exact: true }).click();
  const writ = page.getByRole('region', { name: 'Current simulated writ', exact: true });
  await expect(writ).toContainText('Not a cc-verify proof');
  for (const winner of winners) await expect(writ).toContainText(winner);
  await result.getByRole('button', { name: 'Recompute this cast', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'This cast’s seal, commitment and winners match.' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Draft a new roll', exact: true })).toBeVisible();
  await auditStyles(page, desktopSurfaces);
  await auditFields(page);
});
