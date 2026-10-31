import { test, expect } from '@playwright/test';
import { guardPage } from './network.ts';

// Stage, proof and Writ Lab journey. This lane runs with reduced motion: the cast reveals at once and
// theatre mode is entered by hand.
test('lottery stage: shape, verdict, prove and tamper in the Writ Lab', async ({ page }) => {
  const verify = await guardPage(page);
  try {
    await page.goto('/#/chamber/lottery');
    await expect(page.locator('.cc-sample')).toHaveText('Simulated');
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
