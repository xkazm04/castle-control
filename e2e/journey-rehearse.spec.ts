import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { guardPage } from './network.ts';
import { auditFields, auditStyles, desktopSurfaces } from './styles.ts';

/** The Map Room opens on the duel; the sand table, Spyglass and Rehearse are local demos behind More. */
async function openSandTable(page: Page) {
  await page.getByRole('button', { name: /^More/ }).click();
  await page.getByRole('menuitem', { name: /^Sand table/ }).click();
  await expect(page.getByRole('region', { name: 'Map Room work', exact: true })).toHaveAttribute('data-view', 'table');
}

const BAND = 'SIMULATED REHEARSAL · no viewers, no identities, no Extension state · sample territory';

// The lane runs with reduced motion, so a round jumps straight to its end state; the timed
// turn-by-turn play and the flip animation are covered by the unit suites.
test('Map Room Rehearse: simulated round, verdict, replay, sizes, comparison and Spyglass end state', async ({ page }) => {
  const verify = await guardPage(page);
  try {
    await page.goto('/#/chamber/studio');
    const room = page.getByRole('region', { name: 'Map Room work', exact: true });
    await openSandTable(page);
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
    await expect(room).toContainText('The room awaits Twitch’s answer on the Extension policy. It makes no network call and cannot advance the test stage.');

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
    await openSandTable(page);
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

test('Map Room Rehearse: redraw the start by painting and dragging, compare crowds, and the table stays untouched', async ({ page }) => {
  const verify = await guardPage(page);
  try {
    await page.goto('/#/chamber/studio');
    const room = page.getByRole('region', { name: 'Map Room work', exact: true });
    await openSandTable(page);
    await room.getByRole('button', { name: 'Rehearse', exact: true }).click();
    const house = (id: string) => room.locator(`[data-hex-tile="${id}"]`).getAttribute('data-house');
    expect(await house('E1')).toBe('unclaimed');

    // Redraw start: a palette with one brush per house; Sable paints E1 by press and F1 to H1 by drag.
    await room.getByRole('button', { name: 'Redraw start', exact: true }).click();
    await expect(room.getByRole('group', { name: 'Paint with', exact: true })).toBeVisible();
    await expect(room.getByRole('note', { name: 'Simulated rehearsal notice', exact: true })).toHaveText(BAND);
    await room.getByRole('button', { name: 'Paint with House Sable', exact: true }).click();
    await room.locator('[data-hex-tile="E1"]').click();
    expect(await house('E1')).toBe('House Sable');
    await expect(room.getByRole('status').filter({ hasText: 'E1 painted House Sable. 1 tile differs from the starting territory.' })).toBeVisible();
    const from = await room.locator('[data-hex-tile="F1"]').boundingBox(); const to = await room.locator('[data-hex-tile="H1"]').boundingBox();
    if (!from || !to) throw new Error('hexes not laid out');
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2); await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 }); await page.mouse.up();
    for (const id of ['F1', 'G1', 'H1']) expect(await house(id), id).toBe('House Sable');
    expect(await house('I1')).toBe('House Tallow');
    await expect(room.getByRole('button', { name: 'Restore the sample territory, 4 tiles repainted', exact: true })).toBeVisible();

    // Keyboard: Enter on a focused hex paints it; arrows only move.
    await room.getByRole('button', { name: 'Paint with Unclaimed', exact: true }).click();
    await room.locator('[data-hex-tile="A1"]').focus(); await page.keyboard.press('ArrowRight');
    expect(await house('B1')).toBe('House Quill');
    await page.keyboard.press('Enter');
    expect(await house('B1')).toBe('unclaimed');
    await room.getByRole('button', { name: 'Redraw start', exact: true }).click();
    await expect(room.getByRole('group', { name: 'Paint with', exact: true })).toHaveCount(0);

    // The round plays on the redrawn start, and the earlier table view still shows the untouched sample.
    await room.getByRole('button', { name: 'Play round', exact: true }).click();
    await expect(room.locator('.studio-verdict')).toBeVisible();
    await room.getByRole('button', { name: 'Table', exact: true }).click();
    expect(await house('E1')).toBe('unclaimed'); expect(await house('B1')).toBe('House Quill');
    await room.getByRole('button', { name: 'Rehearse', exact: true }).click();

    // Compare crowds: 30, 120 and 300 on this redrawn board; Use puts a crowd in the form.
    await room.getByRole('button', { name: 'Compare crowds', exact: true }).click();
    const crowds = room.getByRole('region', { name: 'Simulated comparison across crowd sizes', exact: true });
    await expect(crowds.locator('tbody tr')).toHaveCount(3);
    await expect(crowds).toContainText('redrawn start');
    await crowds.getByRole('button', { name: 'Use 300 simulated viewers', exact: true }).click();
    await expect(room.getByLabel('Simulated viewers', { exact: true })).toHaveValue('300');
    await expect(crowds.locator('tr[data-current="true"]')).toContainText('300 viewers');

    // Restore sample puts the starting territory back, and a new map size drops the edits.
    await room.getByRole('button', { name: 'Redraw start', exact: true }).click();
    await room.getByRole('button', { name: /^Restore the sample territory/ }).click();
    expect(await house('E1')).toBe('unclaimed'); expect(await house('B1')).toBe('House Quill');
    await room.getByRole('button', { name: 'Paint with House Tallow', exact: true }).click();
    await room.locator('[data-hex-tile="A1"]').click();
    await expect(room.getByRole('button', { name: 'Restore the sample territory, 1 tile repainted', exact: true })).toBeVisible();
    await room.getByLabel('Map size', { exact: true }).selectOption('s');
    await expect(room.getByRole('button', { name: /^Restore the sample territory, \d+ tiles? repainted$/ })).toHaveCount(0);
    await auditStyles(page, desktopSurfaces); await auditFields(page);
  } finally { await page.goto('about:blank'); verify(); }
});
