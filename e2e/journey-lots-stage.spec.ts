import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { guardPage } from './network.ts';
import { castSample } from './lots-steward.ts';

async function drawingHeight(page: Page) {
  return page.locator('.lottery-draw-svg').evaluate(element => {
    if (!(element instanceof SVGSVGElement)) throw new Error('Missing draw SVG');
    const matrix = element.getScreenCTM();
    if (!matrix) throw new Error('Draw SVG has no rendered transform');
    return Math.hypot(matrix.c, matrix.d) * element.viewBox.baseVal.height;
  });
}

// Stage, proof and Writ Lab journey. The cast comes from the Steward's "Cast the lots" flow. This lane runs with reduced motion: the cast reveals at once and
// theatre mode is entered by hand.
test('lottery stage: shape, verdict, prove and tamper in the Writ Lab', async ({ page }) => {
  const verify = await guardPage(page);
  try {
    await page.goto('/#/chamber/lottery');
    await expect(page.locator('.cc-rampart > [data-stamp="simulated"]')).toHaveText('Simulated');
    const stage = page.locator('.lottery-draw-stage');
    await page.getByRole('group', { name: 'Draw shape', exact: true }).getByRole('button', { name: 'Wheel', exact: true }).click();
    await expect(stage).toHaveAttribute('data-shape', 'wheel');
    await expect(stage.locator('[data-lot-dot]')).toHaveCount(87);
    await castSample(page);
    await expect(stage).toHaveAttribute('data-phase', 'revealed');
    await expect(stage.locator('[data-medal]')).toHaveCount(3);
    // The desk view closes on a chip; the full stage closes on the verdict card and its lab handoff.
    await expect(stage.locator('.lottery-stage-foot')).toContainText('Writ verified');
    await expect.poll(() => drawingHeight(page)).toBeGreaterThanOrEqual(260);
    await page.getByRole('button', { name: 'Full stage', exact: true }).click();
    await expect(stage.locator('.lottery-stage-verdict')).toContainText('Writ verified');
    await page.getByRole('button', { name: 'Prove it in the Writ Lab', exact: true }).click();
    const lab = page.getByRole('region', { name: 'Writ Lab', exact: true });
    await expect(lab).toBeInViewport();
    const verdict = lab.getByRole('status');
    await expect(verdict).toHaveText('Writ verified · every step passes.');
    await lab.getByRole('button', { name: 'Weight +1', exact: true }).click();
    await expect(verdict).toContainText('Tamper caught at step 2');
    await expect(lab.locator('.lottery-lab-step[data-status="fail"]')).toContainText('SHA-256 seal');
    await lab.getByRole('button', { name: 'Simulated beacon writ', exact: true }).click();
    await expect(verdict).toHaveText('Writ verified · every step passes.');
    await expect(lab).toContainText('BLS signature verified against the simulated chain key');
    await lab.getByRole('button', { name: 'Forge the beacon', exact: true }).click();
    await expect(verdict).toContainText('Tamper caught at step 3');
    await expect(lab).toContainText('The BLS signature does not verify against the chain anchor');
  } finally { await page.goto('about:blank'); verify(); }
});

test('reduced-motion hand reveals keep the drawing and Space call visible at 1280x800', async ({ page }) => {
  const verify = await guardPage(page);
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/#/chamber/lottery');
    await page.getByRole('button', { name: 'Reveal by hand', exact: true }).click();
    await castSample(page, 'By hand');
    for (let order = 1; order <= 3; order++) {
      const call = page.getByRole('button', { name: order === 1 ? 'Call the first lot' : `Call lot ${order} of 3`, exact: true });
      await expect(call).toBeFocused();
      await expect(call).toBeInViewport({ ratio: 1 });
      await expect.poll(() => drawingHeight(page)).toBeGreaterThanOrEqual(260);
      await page.keyboard.press('Space');
    }
    await expect(page.locator('.lottery-draw-stage')).toHaveAttribute('data-phase', 'revealed');
    await expect.poll(() => drawingHeight(page)).toBeGreaterThanOrEqual(260);
    await expect(page.locator('[data-stage-winner="1"]')).toBeInViewport({ ratio: 1 });
  } finally { await page.goto('about:blank'); verify(); }
});


// Guard the short work area underneath the retained Cutaway band/title card.
for (const viewport of [{ width: 1280, height: 800 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
  for (const theme of ['day', 'night'] as const) {
    test(`the draw fits its urn panel at ${viewport.width}x${viewport.height} on ${theme}`, async ({ page }) => {
      const verify = await guardPage(page);
      try {
        await page.setViewportSize(viewport);
        await page.goto('/#/chamber/lottery');
        const pool = page.locator('[data-role="lot-urn-panel"]');
        await expect(pool).toBeVisible();
        if (theme === 'night') await page.getByRole('button', { name: 'Toggle day and night' }).click();
        const measure = () => pool.evaluate(element => {
          const box = element.getBoundingClientRect();
          const issues: string[] = [];
          for (const selector of ['.lottery-stage-top', '.lottery-stage-phase', '.lottery-draw-svg', '.lottery-pool-heading', '.lottery-stage-rail', '.lottery-stage-foot']) {
            const child = element.querySelector(selector);
            if (!child) {
              if (selector !== '.lottery-stage-rail' && selector !== '.lottery-stage-foot') issues.push(`missing ${selector}`);
              continue;
            }
            const at = child.getBoundingClientRect();
            if (at.top < box.top - 1 || at.bottom > box.bottom + 1 || at.left < box.left - 1 || at.right > box.right + 1) issues.push(`outside ${selector}`);
            const minimum = element.closest('[data-theatre="true"]') ? 48 : 260;
            if (selector === '.lottery-draw-svg' && at.height < minimum) issues.push(`drawing too short: ${at.height}`);
          }
          if (element.scrollHeight > element.clientHeight + 1) issues.push('urn panel needs scrolling');
          if (element.scrollWidth > element.clientWidth + 1) issues.push('urn panel spills sideways');
          const controls = [...element.querySelectorAll('.lottery-stage-top > *')].map(node => node.getBoundingClientRect());
          for (const [index, at] of controls.entries()) {
            for (const other of controls.slice(index + 1)) {
              if (Math.min(at.right, other.right) - Math.max(at.left, other.left) > 1
                && Math.min(at.bottom, other.bottom) - Math.max(at.top, other.top) > 1) issues.push('controls overlap');
            }
          }
          const row = element.querySelector('.lottery-stage-top')?.getBoundingClientRect();
          for (const control of element.querySelectorAll('.lottery-stage-top button, .lottery-stage-top summary')) {
            const at = control.getBoundingClientRect();
            if (!row || at.left < row.left - 1 || at.right > row.right + 1 || at.top < row.top - 1 || at.bottom > row.bottom + 1) issues.push('control outside its row');
          }
          for (const node of element.querySelectorAll('button, summary, p, b, small, [data-role="panel-gloss"], .cc-hero-caption')) {
            if (getComputedStyle(node).display !== 'none' && Number.parseFloat(getComputedStyle(node).fontSize) < 13) issues.push('text below the floor');
          }
          return issues;
        });
        for (const shape of ['Urn', 'Wheel', 'Deck', 'Ballot box']) {
          await page.getByRole('group', { name: 'Draw shape', exact: true }).getByRole('button', { name: shape, exact: true }).click();
          await expect.poll(measure).toEqual([]);
          await expect.poll(() => drawingHeight(page)).toBeGreaterThanOrEqual(260);
          console.info(`Lot Chamber ${viewport.width}x${viewport.height} ${theme} ${shape}: ${await drawingHeight(page)}px drawing height`);
        }
        const width = (await pool.boundingBox())?.width ?? 0;
        await page.getByRole('button', { name: 'Full stage', exact: true }).focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('.cc-desk')).toBeHidden();
        await expect.poll(async () => (await pool.boundingBox())?.width ?? 0).toBeGreaterThan(width);
        await expect.poll(async () => (await pool.boundingBox())?.width ?? 0)
          .toBeCloseTo((await page.locator('.cc-hall').boundingBox())?.width ?? 0, 0);
        await expect.poll(measure).toEqual([]);
        await page.getByRole('button', { name: 'Back to the desk', exact: true }).focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('.cc-desk')).toBeVisible();
        await expect.poll(async () => (await pool.boundingBox())?.width ?? 0).toBeCloseTo(width, 0);
        await expect.poll(measure).toEqual([]);
        await expect.poll(() => drawingHeight(page)).toBeGreaterThanOrEqual(260);
        await castSample(page);
        await expect(pool.locator('.lottery-draw-stage')).toHaveAttribute('data-phase', 'revealed');
        await expect.poll(measure).toEqual([]);
        await expect.poll(() => drawingHeight(page)).toBeGreaterThanOrEqual(260);
        await expect(pool.locator('[data-stage-winner="1"]')).toBeInViewport();
        console.info(`Lot Chamber ${viewport.width}x${viewport.height} ${theme} completed cast: ${await drawingHeight(page)}px drawing height`);
      } finally { await page.goto('about:blank'); verify(); }
    });
  }
}
