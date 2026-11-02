import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { guardPage } from './network.ts';
import { auditFields, auditStyles, desktopSurfaces } from './styles.ts';

const counts = async (stage: Locator) => Promise.all(['left', 'right'].map(async side =>
  Number(await stage.locator(`[data-role="ty-count-${side}"]`).innerText())));
const titles = (stage: Locator) => stage.locator('[data-role="ty-card-title"]');
async function seal(page: Page) {
  const hold = page.getByRole('button', { name: 'Hold to seal', exact: true });
  await hold.focus();
  await page.keyboard.down('Space');
  await expect(hold).toHaveCount(0, { timeout: 5_000 });
  await page.keyboard.up('Space');
}
const chip = (page: Page, name: string) => page.getByRole('group', { name: 'Steward suggestions', exact: true })
  .getByRole('button', { name, exact: true });

test('Map Room duel: one match on the stage, compact strip, full bracket on demand, calls, call-off and a champion', async ({ page }) => {
  test.setTimeout(90_000);
  const verify = await guardPage(page);
  try {
    await page.goto('/#/chamber/studio');
    const room = page.getByRole('region', { name: 'Map Room work', exact: true });
    const stage = room.getByRole('region', { name: 'The duel stage', exact: true });
    await expect(room).toHaveAttribute('data-view', 'duel');
    await expect(stage).toBeFocused();
    await expect(stage).toHaveAttribute('data-phase', 'ready');
    await expect(titles(stage)).toHaveText(['Raze the mill', 'Borrow the mill']);
    await expect(stage.locator('[data-role="ty-simulated"]')).toBeVisible();
    await expect(stage.locator('[data-role="ty-match-label"]')).toHaveText('Match 1 of 3');
    // Only where you are: a strip of pips, never the whole tree on the stage. No sand table either.
    await expect(stage.locator('[data-role="ty-strip"] .duel-pip')).toHaveCount(3);
    await expect(stage.locator('[data-role="ty-match"]')).toHaveCount(0);
    await expect(room.locator('[data-hex-tile]')).toHaveCount(0);
    // The hero, its tally and the streamer's actions sit above the Steward dock without scrolling.
    const dock = await page.getByRole('region', { name: 'The Steward', exact: true }).boundingBox();
    const open = await stage.getByRole('button', { name: /Open the vote/ }).boundingBox();
    expect(open && dock && open.y + open.height).toBeLessThanOrEqual(dock?.y ?? 0);

    // The full bracket opens on demand, fits the viewport and closes with Esc without leaving the room.
    await stage.getByRole('button', { name: 'Full bracket', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Full bracket', exact: true });
    await expect(sheet.locator('[data-role="ty-match"]')).toHaveCount(3);
    await expect(sheet.locator('[data-role="ty-match"][aria-current="step"]')).toContainText('Raze the mill');
    const box = await sheet.boundingBox();
    expect(box && box.y >= 0 && box.y + box.height <= (page.viewportSize()?.height ?? 0)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(page).toHaveURL(/#\/chamber\/studio$/);
    await expect(stage).toBeFocused();

    // Enter opens the vote; generated SIMULATED ballots arrive and the tally moves.
    await page.keyboard.press('Enter');
    await expect(stage).toHaveAttribute('data-phase', 'live');
    await expect.poll(async () => (await counts(stage)).reduce((a, b) => a + b, 0), { timeout: 12_000 }).toBeGreaterThan(0);
    await expect(stage.locator('[data-role="ty-barred"]')).toContainText('barred by moderation · never counted');

    // The streamer's call overrides the tally, logged openly, and freezes it.
    await page.keyboard.press('ArrowRight');
    const verdict = stage.locator('[data-role="ty-verdict"]');
    await expect(verdict).toHaveText('Your call: Borrow the mill');
    await expect(verdict).toHaveAttribute('data-how', 'call');
    await expect(stage.locator('[data-role="ty-card"][data-side="1"]')).toHaveAttribute('data-result', 'won');
    await expect(stage.locator('[data-role="ty-card"][data-result="won"] [data-role="ty-stamp"]')).toHaveText('Your call');
    const frozen = await counts(stage);
    await page.waitForTimeout(1_000);
    expect(await counts(stage)).toEqual(frozen);

    // Next match opens the second semifinal; Esc calls it off without leaving the room; Enter resumes.
    await stage.getByRole('button', { name: /Next match/ }).click();
    await expect(titles(stage)).toHaveText(['Tax the miller', 'Spare it']);
    await expect(stage.locator('[data-role="ty-match-label"]')).toHaveText('Match 2 of 3');
    await expect(stage).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(stage).toHaveAttribute('data-phase', 'called_off');
    await expect(page).toHaveURL(/#\/chamber\/studio$/);
    await page.keyboard.press('Enter');
    await expect(stage).toHaveAttribute('data-phase', 'live');

    // Enter closes the window on the tally (or the seed breaks a tie); then the final, a call, the champion.
    await page.keyboard.press('Enter');
    await expect(verdict).toHaveText(/^(Chat chose|Tie · higher seed wins): /);
    await page.keyboard.press('Enter');
    await expect(stage.locator('[data-role="ty-round"]')).toHaveText('Final');
    await page.keyboard.press('ArrowLeft');
    const champion = (await titles(stage).first().innerText()).trim();
    await page.keyboard.press('Enter');
    await expect(stage).toHaveAttribute('data-phase', 'done');
    await expect(stage.locator('[data-role="ty-champion"]')).toHaveText(`Champion: ${champion}`);
    await expect(stage.locator('[data-role="ty-champ-slot"]')).toHaveText(champion);
    await stage.getByRole('button', { name: 'Full bracket', exact: true }).click();
    await expect(sheet.locator('[data-role="ty-champion-slot"]')).toHaveText(champion);
    await sheet.getByRole('button', { name: /Close/ }).click();
    // Undo reopens the final.
    await page.keyboard.press('Backspace');
    await expect(stage).toHaveAttribute('data-phase', 'live');
    await expect(stage.locator('[data-role="ty-round"]')).toHaveText('Final');

    // Showdown and Ladder stay reachable behind More as local demos; the duel keeps its place.
    await stage.getByRole('button', { name: /^More/ }).click();
    const menu = page.getByRole('menu', { name: 'More Map Room views', exact: true });
    await expect(menu.getByRole('menuitem')).toHaveCount(5);
    await expect(menu).toContainText('Nothing reaches chat, OBS or the core.');
    await menu.getByRole('menuitem', { name: /^Showdown/ }).click();
    const demos = room.getByRole('dialog', { name: 'Local duel demos · Showdown and Ladder', exact: true });
    await expect(demos.locator('[data-role="ty-pennant"]')).toHaveCount(2);
    await expect(room).toContainText('Local demo');
    await room.getByRole('button', { name: 'Back to the duel', exact: true }).click();
    await expect(stage.locator('[data-role="ty-round"]')).toHaveText('Final');
    await auditStyles(page, desktopSurfaces);
    await auditFields(page);
  } finally { await page.goto('about:blank'); verify(); }
});

test('Map Room Steward: Start a duel drafts on the stage, nothing starts until the seal; Play demo crowns a SIMULATED champion', async ({ page }) => {
  test.setTimeout(120_000);
  const verify = await guardPage(page);
  try {
    await page.goto('/#/chamber/studio');
    const stage = page.getByRole('region', { name: 'The duel stage', exact: true });
    await expect(stage).toHaveAttribute('data-phase', 'ready');
    await chip(page, 'Start a duel').click();
    const sheet = page.getByRole('group', { name: 'Steward conversation', exact: true });
    await sheet.getByRole('button', { name: /Your own list/ }).click();
    await page.keyboard.type('Which snack wins the night?'); await page.keyboard.press('Enter');
    await page.keyboard.type('Crisps; Popcorn; Pretzels'); await page.keyboard.press('Enter');
    await expect(sheet).toContainText('Name 2, 4 or 8 contestants');
    await page.keyboard.press('Control+A');
    await page.keyboard.type('Crisps; Popcorn; Pretzels; Grapes'); await page.keyboard.press('Enter');
    // The draft takes the stage: seed 1 meets seed 4, marked DRAFT, with every control frozen.
    await expect(stage).toHaveAttribute('data-draft', 'true');
    await expect(stage.locator('[data-role="ty-draft"]')).toHaveText('Draft · not started');
    await expect(titles(stage)).toHaveText(['Crisps', 'Grapes']);
    await sheet.getByRole('button', { name: /30 seconds/ }).click();
    await sheet.getByRole('button', { name: /Looks right/ }).click();
    await expect(sheet).toContainText('Fixture mode: SIMULATED ballots on this machine. Nothing reaches chat or OBS.');
    await seal(page);
    await expect(stage).not.toHaveAttribute('data-draft', 'true');
    await expect(stage).toHaveAttribute('data-phase', 'live');
    await expect(titles(stage)).toHaveText(['Crisps', 'Grapes']);
    await expect(stage.locator('[data-role="ty-round"]')).toHaveText('Semifinal');

    await chip(page, 'Play demo').click();
    await page.getByRole('group', { name: 'Steward conversation', exact: true }).getByRole('button', { name: /Go on/ }).click();
    await seal(page);
    await expect(stage).toHaveAttribute('data-phase', 'live');
    await expect(stage.locator('[data-role="ty-simulated"]')).toBeVisible();
    await expect(stage).toContainText('Demo: generated ballots arrive');
    await expect(stage.locator('[data-role="ty-phase"]')).toContainText('×3');
    await expect.poll(async () => (await counts(stage)).reduce((a, b) => a + b, 0), { timeout: 10_000 }).toBeGreaterThan(0);
    await expect(stage).toHaveAttribute('data-phase', 'verdict', { timeout: 15_000 });
    await expect(stage).toHaveAttribute('data-phase', 'done', { timeout: 60_000 });
    await expect(stage).toContainText('Demo finished');
    await expect(stage.locator('[data-role="ty-champion"]')).toHaveText(/^Champion: /);
  } finally { await page.goto('about:blank'); verify(); }
});
