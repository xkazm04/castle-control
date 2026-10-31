import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { startOverlay, visualId } from './overlay-server.ts';

async function assertCanvas(page: Page): Promise<void> {
  const state = await page.evaluate(() => ({
    backgrounds: [document.documentElement, document.body, document.getElementById('scene')]
      .map(node => node && getComputedStyle(node).backgroundColor),
    overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight
      || document.body.scrollWidth > innerWidth || document.body.scrollHeight > innerHeight,
    outside: [...document.querySelectorAll('#scene > :not(script)')].filter(node => {
      const box = node.getBoundingClientRect();
      return box.left < -0.1 || box.top < -0.1 || box.right > innerWidth + 0.1 || box.bottom > innerHeight + 0.1;
    }).length,
  }));
  expect(state.backgrounds).toEqual(['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)']);
  expect(state.overflow).toBe(false);
  expect(state.outside).toBe(0);
}

for (const viewport of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }]) {
  test.describe(`OBS browser source ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });
    let overlay: Awaited<ReturnType<typeof startOverlay>>;
    test.beforeEach(async () => { overlay = await startOverlay(); });
    test.afterEach(async ({ page }) => { await page.goto('about:blank'); await overlay.close(); });

    test('transparent before the module loads, then fits oversized artwork without scrolling', async ({ page }) => {
      await page.route('**/bundle.js', route => route.abort());
      await page.goto(`${overlay.url}/beacons/${visualId}`);
      await assertCanvas(page);
      await page.unroute('**/bundle.js');
      await page.reload();
      await expect(page.locator('#scene > div')).toHaveCount(1);
      await assertCanvas(page);
      await overlay.publish({ oversized: true });
      await expect(page.locator('#scene')).toContainText('Oversized');
      await assertCanvas(page);
      await page.setViewportSize({ width: 960, height: 540 });
      await expect.poll(async () => page.locator('#scene').evaluate(node => node.getBoundingClientRect().width))
        .toBeLessThanOrEqual(960);
      await assertCanvas(page);
    });

    test('scale and anchors are display-only, invalid values use centered defaults', async ({ page }) => {
      for (const anchor of ['tl', 'tr', 'bl', 'br', 'center']) {
        await page.goto(`${overlay.url}/beacons/${visualId}?scale=0.5&anchor=${anchor}`);
        await expect(page.locator('#scene > div')).toHaveCount(1);
        const box = await page.locator('#scene > div').boundingBox();
        expect(box).not.toBeNull();
        expect(box?.width).toBeCloseTo(180);
        expect(box?.height).toBeCloseTo(40);
        expect(box?.x).toBeCloseTo(anchor === 'center' ? (viewport.width - 180) / 2 : anchor.endsWith('l') ? 0 : viewport.width - 180);
        expect(box?.y).toBeCloseTo(anchor === 'center' ? (viewport.height - 40) / 2 : anchor.startsWith('t') ? 0 : viewport.height - 40);
        const badge = page.locator('[data-simulated-badge]');
        await expect(badge).toBeVisible();
        const badgeBox = await badge.boundingBox();
        if (!box || !badgeBox) throw new Error('Missing simulated art or provenance badge');
        expect(badgeBox.x + badgeBox.width <= box.x || box.x + box.width <= badgeBox.x
          || badgeBox.y + badgeBox.height <= box.y || box.y + box.height <= badgeBox.y).toBe(true);
        await assertCanvas(page);
      }
      for (const query of ['', '?scale=2&anchor=br', '?scale=3&anchor=nope', '?scale=NaN', '?scale=0.5&scale=2&anchor=tl&anchor=br']) {
        await page.goto(`${overlay.url}/beacons/${visualId}${query}`);
        await expect(page.locator('#scene > div')).toHaveCount(1);
        const box = await page.locator('#scene > div').boundingBox();
        const zoom = query === '?scale=2&anchor=br';
        expect(box?.width).toBeCloseTo(zoom ? 720 : 360);
        expect(box?.x).toBeCloseTo(zoom ? viewport.width - 720 : (viewport.width - 360) / 2);
        await assertCanvas(page);
      }
    });

    test('package replacement needs no refresh and keeps truthful provenance', async ({ page }) => {
      await page.goto(`${overlay.url}/beacons/${visualId}`);
      const scene = page.locator('#scene');
      const badge = page.locator('[data-simulated-badge]');
      await expect(badge).toBeVisible();
      await expect(scene).toHaveAttribute('data-intensity', '0.75');
      const before = overlay.pushes();
      const hash = await scene.getAttribute('data-package-hash');
      await overlay.publish({ oversized: true });
      await expect(scene).toContainText('Oversized');
      await expect(scene).not.toHaveAttribute('data-package-hash', hash ?? '');
      await expect(badge).toBeVisible();
      await overlay.publish({ simulated: false }); // Synthetic live flag; no live service.
      await expect(badge).toBeHidden();
      await overlay.publish({ invalid: true });
      await expect(scene).toHaveAttribute('data-simulated', 'false');
      await expect(badge).toBeHidden();
      expect(overlay.pushes()).toBe(before);
      await assertCanvas(page);
    });
  });
}
