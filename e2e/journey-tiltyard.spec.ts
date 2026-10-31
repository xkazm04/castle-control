import { test, expect } from '@playwright/test';
import { guardPage } from './network.ts';
import { auditFields, auditStyles, desktopSurfaces } from './styles.ts';

test('Map Room Tiltyard: champion, cancellation, simulated tally, streamer call and hill placement', async ({ page }) => {
  const verify = await guardPage(page);
  try {
    await page.goto('/#/chamber/studio');
    const room = page.getByRole('region', { name: 'Map Room work', exact: true });
    const views = room.getByRole('group', { name: 'Map view', exact: true });
    await expect(room.locator('[data-hex-tile]')).toHaveCount(54);
    const inspector = room.getByLabel('Selected tile', { exact: true });
    const inspection = await inspector.textContent();
    await expect(views.getByRole('button')).toHaveCount(4);
    await room.getByRole('button', { name: 'Spyglass', exact: true }).click();
    await expect(room.locator('[data-viewer-frame]')).toHaveCount(1);
    await room.getByRole('button', { name: 'Tiltyard', exact: true }).click();
    const stage = room.getByRole('dialog', { name: 'The Tiltyard, duel stage', exact: true });
    const arena = stage.locator('[data-role="ty-arena"]');
    const decided = stage.locator('[data-role="ty-match"]:has(.ty-w)');
    await expect(stage).toBeFocused();
    await expect(stage).toHaveAttribute('data-motion', 'reduced');
    await expect(room).toHaveAttribute('data-view', 'tiltyard');
    await expect(views.locator('button[aria-pressed="true"]')).toHaveText('Tiltyard');
    await expect(views).toContainText('The duel component · hosted as a Map Room view');
    await expect(views).toContainText('Sample items · simulated chat');
    await expect(room.locator('[data-hex-tile]')).toHaveCount(0);
    const layout = await room.evaluate(element => {
      const field = element.querySelector('.studio-table-work');
      const side = element.querySelector('.cc-herald-side');
      if (!field || !side) throw new Error('Missing Map Room columns');
      return { room_width: element.getBoundingClientRect().width, field_width: field.getBoundingClientRect().width,
        field_bottom: field.getBoundingClientRect().bottom, side_top: side.getBoundingClientRect().top };
    });
    expect(layout.field_width).toBeCloseTo(layout.room_width, 0);
    expect(layout.side_top).toBeGreaterThanOrEqual(layout.field_bottom);
    await expect(room.getByLabel('Seal slot', { exact: true })).toHaveCount(1);

    for (let pick = 0; pick < 7; pick++) {
      const key = pick % 2 === 0 ? 'ArrowLeft' : 'ArrowRight';
      await page.keyboard.press(key);
      await expect(decided).toHaveCount(pick + 1);
      await expect(arena).toHaveAttribute('data-verdict', String(pick % 2));
      await page.keyboard.press(key); // skip this theatre, without recording another pick
    }
    await expect(stage.locator('[data-role="ty-champion-card"]')).toBeVisible();
    await expect(stage.locator('[data-role="ty-order-row"]')).toHaveCount(8);
    await expect(decided).toHaveCount(7);
    await expect(inspector).toHaveText(inspection ?? '');

    await stage.getByRole('button', { name: 'New bracket', exact: true }).click();
    await stage.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(decided).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(stage.getByRole('heading', { name: 'The lists are closed', exact: true })).toBeVisible();
    await expect(page).toHaveURL(/#\/chamber\/studio$/);
    await expect(page.getByRole('heading', { name: 'The Map Room', exact: true })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(arena).toHaveAttribute('data-live', '1');
    await expect(stage.getByRole('heading', { name: 'The lists are closed', exact: true })).toHaveCount(0);
    await expect(decided).toHaveCount(1);

    await page.keyboard.press(']');
    const ticker = stage.getByLabel('SIMULATED · Simulated chat ticker', { exact: true });
    await expect(ticker).toHaveAttribute('data-provenance', 'simulated');
    await expect(ticker.locator('[data-role="ty-tick"]')).not.toHaveCount(0);
    const barred = stage.locator('[data-role="ty-barred"]');
    await expect.poll(async () => Number((await barred.innerText()).match(/(\d+) ballots?\b/)?.[1] ?? 0),
      { timeout: 12_000 }).toBeGreaterThan(0);
    await page.keyboard.press('Enter');
    await expect(stage.locator('[data-role="ty-hint"]')).toContainText(/Chat chose|Tie/);
    await expect(barred).toContainText('Barred · never counted');
    const barred_count = (await barred.innerText()).match(/(\d+) ballots?\b/);
    expect(Number(barred_count?.[1] ?? 0)).toBeGreaterThan(0);

    await page.keyboard.press('Enter'); // next open window
    await expect(arena).toHaveAttribute('data-verdict', '-1');
    const legend = stage.locator('[data-role="ty-tug-legend"]');
    const numbers = async () => (await legend.locator('b').allTextContents()).filter(text => /^\d+$/.test(text)).map(Number);
    await expect.poll(async () => (await numbers())[1] ?? 0).toBeGreaterThan(0);
    // Read and call in one browser task; the microtask lets React commit the
    // verdict before the second read, without letting an arrival timer run.
    const { before, after } = await stage.evaluate(async element => {
      const read = () => [...element.querySelectorAll('[data-role="ty-tug-legend"] b')]
        .map(node => node.textContent ?? '').filter(text => /^\d+$/.test(text)).map(Number);
      const before = read();
      element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
      await Promise.resolve();
      return { before, after: read() };
    });
    expect(before).toHaveLength(3);
    expect(before[1]).toBeGreaterThan(0);
    const winning_stamp = stage.locator('[data-role="ty-card"][data-result="won"] [data-role="ty-stamp"]');
    await expect(winning_stamp).toHaveText('Your call');
    await expect(winning_stamp).toBeVisible();
    await expect(stage.locator('[data-role="ty-card"]').first()).toHaveAttribute('data-result', 'lost');
    await expect(stage.locator('[data-role="ty-hint"]')).toContainText('Streamer call · logged openly');
    expect(after).toEqual(before);
    expect(await numbers()).toEqual(before);

    await page.keyboard.press(']');
    const rungs = stage.locator('[data-role="ty-hill"] [data-role="ty-rung"]:not([data-state="fell"]):not([data-state="slot"])');
    await expect(rungs).toHaveCount(10);
    await page.keyboard.press('Enter');
    await expect(arena).toHaveAttribute('data-live', '1');
    for (let pick = 0; pick < 4; pick++) {
      if (await stage.locator('[data-role="ty-board-title"]').count()) break;
      const key = pick % 2 === 0 ? 'ArrowLeft' : 'ArrowRight';
      await page.keyboard.press(key);
      await expect(arena).toHaveAttribute('data-verdict', String(pick % 2));
      await page.keyboard.press(key);
    }
    await expect(stage.locator('[data-role="ty-board-title"]')).toHaveText(/Placed at #|Off the hill/);
    await expect(rungs).toHaveCount(10);
    await auditStyles(page, desktopSurfaces);
    await auditFields(page);
    await stage.focus();
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/#\/keep$/);
    await expect(stage).toHaveCount(0);

    await page.getByRole('button', { name: /^Open chamber 4, Map Room/ }).click();
    await expect(page).toHaveURL(/#\/chamber\/studio$/);
    await room.getByRole('button', { name: 'Tiltyard', exact: true }).click();
    await expect(stage).toBeVisible();
    await room.getByRole('button', { name: 'Table', exact: true }).click();
    await expect(room).toHaveAttribute('data-view', 'table');
    await expect(room.locator('[data-hex-tile]')).toHaveCount(54);
    await expect(stage).toHaveCount(0);
  } finally { await page.goto('about:blank'); verify(); }
});
