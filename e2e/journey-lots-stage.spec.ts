import { test, expect } from '@playwright/test';
import { guardPage } from './network.ts';

// Stage, proof and Writ Lab journey. This lane runs with reduced motion: the cast reveals at once and
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
    await page.getByRole('button', { name: 'Preview this draw', exact: true }).click();
    const hold = page.getByRole('button', { name: 'Hold to seal', exact: true });
    await hold.focus();
    await page.keyboard.down('Space');
    try { await expect(page.getByText('Entry list frozen · simulated', { exact: true })).toBeVisible(); }
    finally { await page.keyboard.up('Space'); }
    await page.getByRole('button', { name: 'Start simulated draw', exact: true }).click();
    await expect(stage).toHaveAttribute('data-phase', 'revealed');
    await expect(stage.locator('[data-medal]')).toHaveCount(3);
    // The desk view closes on a chip; the full stage closes on the verdict card and its lab handoff.
    await expect(stage.locator('.lottery-stage-foot')).toContainText('Writ verified');
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


// Guard the short work area underneath the retained Cutaway band/title card.
for (const viewport of [{ width: 1280, height: 800 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
  for (const theme of ['paper', 'stock'] as const) {
    test(`the draw fits its urn panel at ${viewport.width}x${viewport.height} on ${theme}`, async ({ page }) => {
      const verify = await guardPage(page);
      try {
        await page.setViewportSize(viewport);
        await page.goto('/#/chamber/lottery');
        const pool = page.locator('[data-role="lot-urn-panel"]');
        await expect(pool).toBeVisible();
        if (theme === 'stock') await page.getByRole('button', { name: 'Toggle paper and dark stock' }).click();
        const measure = () => pool.evaluate(element => {
          const box = element.getBoundingClientRect();
          const issues: string[] = [];
          for (const selector of ['.lottery-draw-stage', '.lottery-draw-svg', '.lottery-pool-readings']) {
            const child = element.querySelector(selector);
            if (!child) { issues.push(`missing ${selector}`); continue; }
            const at = child.getBoundingClientRect();
            if (at.top < box.top - 1 || at.bottom > box.bottom + 1 || at.left < box.left - 1 || at.right > box.right + 1) issues.push(`outside ${selector}`);
            if (selector === '.lottery-draw-svg' && at.height < 48) issues.push('drawing lost its height');
          }
          if (element.scrollHeight > element.clientHeight + 1) issues.push('urn panel needs scrolling');
          const controls = [...element.querySelectorAll('.lottery-stage-top > *')].map(node => node.getBoundingClientRect());
          for (const [index, at] of controls.entries()) {
            if (index && at.left < (controls[index - 1]?.right ?? 0) - 1) issues.push('control row overlaps');
            if (at.bottom > (controls[0]?.bottom ?? 0) + 1 || at.top < (controls[0]?.top ?? 0) - 1) issues.push('controls left the row');
          }
          for (const node of element.querySelectorAll('button, summary, p, b, small, [data-role="panel-gloss"], .cc-hero-caption')) {
            if (getComputedStyle(node).display !== 'none' && Number.parseFloat(getComputedStyle(node).fontSize) < 13) issues.push('text below the floor');
          }
          return issues;
        });
        for (const shape of ['Urn', 'Wheel', 'Deck', 'Ballot box']) {
          await page.getByRole('group', { name: 'Draw shape', exact: true }).getByRole('button', { name: shape, exact: true }).click();
          await expect.poll(measure).toEqual([]);
        }
        const width = (await pool.boundingBox())?.width ?? 0;
        await page.getByRole('button', { name: 'Full stage', exact: true }).click();
        await expect(page.locator('.cc-desk')).toBeHidden();
        await expect.poll(async () => (await pool.boundingBox())?.width ?? 0).toBeGreaterThan(width * 1.8);
        await expect.poll(measure).toEqual([]);
        await page.getByRole('button', { name: 'Back to the desk', exact: true }).click();
        await expect(page.locator('.cc-desk')).toBeVisible();
        await expect.poll(async () => (await pool.boundingBox())?.width ?? 0).toBeCloseTo(width, 0);
        await expect.poll(measure).toEqual([]);
      } finally { await page.goto('about:blank'); verify(); }
    });
  }
}
