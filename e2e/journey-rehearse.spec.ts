import { test, expect } from '@playwright/test';
import { guardPage } from './network.ts';
import { auditFields, auditStyles, desktopSurfaces } from './styles.ts';

const BAND = 'SIMULATED REHEARSAL · no viewers, no identities, no Extension state · sample territory';

// The lane runs with reduced motion, so a round jumps straight to its end state; the timed
// turn-by-turn play and the flip animation are covered by the unit suites.
test('Map Room Rehearse: simulated round, verdict, replay, sizes, comparison and Spyglass end state', async ({ page }) => {
  const verify = await guardPage(page);
  try {
    await page.goto('/#/chamber/studio');
    const room = page.getByRole('region', { name: 'Map Room work', exact: true });
    await expect(room).toBeVisible();
    const toggle = room.getByRole('group', { name: 'Map view', exact: true }).getByRole('button', { name: 'Rehearse', exact: true });
    await toggle.focus(); await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(room.getByRole('note', { name: 'Simulated rehearsal notice', exact: true })).toHaveText(BAND);
    await expect(room.locator('[data-hex-tile]')).toHaveCount(54);

    // Bad settings are refused in words, never played.
    await room.getByLabel('Simulated viewers', { exact: true }).fill('3');
    await room.getByRole('button', { name: 'Play round', exact: true }).click();
    await expect(room.getByRole('alert').filter({ hasText: 'Enter a whole number of simulated viewers from 10 to 1000.' })).toBeVisible();
    await expect(room.locator('[data-flipped]')).toHaveCount(0);

    // Enter in a field plays the round with the settings shown.
    await room.getByLabel('Simulated viewers', { exact: true }).fill('120');
    await room.getByLabel('Seed', { exact: true }).fill('2041');
    await room.getByLabel('Turns', { exact: true }).fill('8');
    await room.getByLabel('Seed', { exact: true }).press('Enter');
    await expect(room.locator('.studio-rehearse-progress').filter({ hasText: 'turn 8 of 8' })).toBeVisible();
    await expect(room.getByRole('status').filter({ hasText: 'Rehearsal finished.' })).toBeVisible();
    const verdict = room.locator('.studio-verdict');
    await expect(verdict).toHaveText(/runaway$|^Stalemate|^Tight race|still contested$/);
    const first = await verdict.textContent();
    await expect(room.getByRole('list', { name: 'Simulated turn log', exact: true }).getByRole('listitem')).toHaveCount(8);
    await expect(room.getByRole('region', { name: 'Rehearsal balance report', exact: true })).toContainText('Spread of shares');
    // Only picked tiles change owner: the ribbon and the table agree about every tile.
    const held = await room.locator('[data-hex-tile]').evaluateAll(nodes => nodes.filter(node => node.getAttribute('data-unclaimed') !== 'true').length);
    const ribbon = await room.getByRole('list', { name: 'Held tiles by house', exact: true }).locator('li:not([data-unclaimed])')
      .evaluateAll(items => items.reduce((sum, item) => sum + Number(item.textContent?.match(/ (\d+) · /)?.[1] ?? 0), 0));
    expect(ribbon).toBe(held);

    // Replay: same seed, same round, and it says so.
    await room.getByRole('button', { name: 'Replay seed 2041', exact: true }).click();
    await expect(room.getByText('Seed 2041 replayed: all 8 turns matched.', { exact: true })).toBeVisible();
    await expect(verdict).toHaveText(first ?? '');
    await room.getByRole('button', { name: 'Rehearse again', exact: true }).first().click();
    await expect(room.getByLabel('Seed', { exact: true })).not.toHaveValue('2041');

    // The board shrinks in the design controls; the earlier run stays beside the new one.
    await room.getByLabel('Seed', { exact: true }).fill('2041');
    await room.getByRole('button', { name: 'Reset', exact: true }).first().click();
    await room.getByLabel('Map size', { exact: true }).selectOption('s');
    await expect(room.locator('[data-hex-tile]')).toHaveCount(24);
    await room.getByRole('button', { name: 'Play round', exact: true }).click();
    await expect(room.locator('.studio-past')).toHaveCount(3); // M, the fresh seed on M, then S
    await expect(room.getByRole('region', { name: 'Earlier simulated rehearsals', exact: true })).toContainText('6 × 4 · 24 tiles');

    // Compare sizes plays S, M and L with these settings and can put one on the table.
    await room.getByRole('button', { name: 'Compare sizes', exact: true }).click();
    const sizes = room.getByRole('region', { name: 'Simulated comparison across map sizes', exact: true });
    await expect(sizes.locator('tbody tr')).toHaveCount(3);
    await sizes.getByRole('button', { name: 'Use map size L · 12 × 8', exact: true }).click();
    await expect(room.locator('[data-hex-tile]')).toHaveCount(96);
    await expect(sizes.locator('tr[data-current="true"]')).toContainText('L · 12 × 8');
    await room.getByLabel('Map size', { exact: true }).selectOption('m');

    // The Spyglass shows the end state of a finished rehearsal, and says so.
    await room.getByRole('button', { name: 'Play round', exact: true }).click();
    await room.getByRole('button', { name: 'Spyglass', exact: true }).click();
    await expect(room.getByText('Showing the end of your simulated rehearsal', { exact: false })).toBeVisible();
    await room.getByRole('button', { name: 'Table', exact: true }).click();
    await expect(room.getByLabel('Selected tile', { exact: true })).toContainText('Now: inspecting');
    await expect(room).toContainText('WP 4.0 is pending');

    await toggle.click();
    await auditStyles(page, desktopSurfaces); await auditFields(page);
  } finally { await page.goto('about:blank'); verify(); }
});

test('Map Room Rehearse plays turn by turn with motion allowed: pause, step, finish', async ({ browser }) => {
  test.setTimeout(90_000); // real one-second turns, and the lane may share a busy machine
  const context = await browser.newContext({ reducedMotion: 'no-preference', viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const verify = await guardPage(page);
  try {
    await page.goto('/#/chamber/studio');
    const room = page.getByRole('region', { name: 'Map Room work', exact: true });
    await room.getByRole('button', { name: 'Rehearse', exact: true }).click();
    await room.getByRole('button', { name: 'Step', exact: true }).click();
    await expect(room.locator('.studio-rehearse-progress').filter({ hasText: 'turn 1 of 8' })).toBeVisible();
    await expect(room.getByRole('status').filter({ hasText: /^Turn 1: / })).toBeVisible();
    await room.getByRole('button', { name: 'Resume', exact: true }).click();
    await expect(room.locator('.studio-rehearse-progress').filter({ hasText: 'turn 3 of 8' })).toBeVisible({ timeout: 6000 });
    await room.getByRole('button', { name: 'Pause', exact: true }).click();
    const paused = await room.locator('.studio-rehearse-progress').textContent();
    await page.waitForTimeout(1500);
    await expect(room.locator('.studio-rehearse-progress')).toHaveText(paused ?? '');
    await expect(room.locator('[data-flipped]').first()).toBeVisible();
    await room.getByRole('button', { name: 'Resume', exact: true }).click();
    await expect(room.locator('.studio-rehearse-progress').filter({ hasText: 'turn 8 of 8' })).toBeVisible({ timeout: 12000 });
    await expect(room.locator('.studio-verdict')).toBeVisible();
  } finally { await page.goto('about:blank'); verify(); await context.close(); }
});
