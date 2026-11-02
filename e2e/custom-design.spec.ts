import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { guardPage } from './network.ts';

// Fixture journeys for "Custom design" in each chamber: request -> library suggestions ->
// living preview -> hold to seal, all SIMULATED. CC_D4_SHOTS=<dir> also saves each step.
const shots = process.env.CC_D4_SHOTS;
const diagnostics = new WeakMap<Page, () => void>();
test.beforeEach(async ({ page }) => { diagnostics.set(page, await guardPage(page)); });
test.afterEach(async ({ page }) => {
  await page.goto('about:blank');
  const verify = diagnostics.get(page);
  if (!verify) throw new Error('Missing diagnostic guard');
  verify();
});

const dock = (page: Page) => page.getByRole('region', { name: 'The Steward' });
async function shot(page: Page, info: TestInfo, name: string) {
  if (!shots) return;
  mkdirSync(shots, { recursive: true });
  const size = page.viewportSize();
  await page.screenshot({ path: `${shots}/${name}-${size?.width ?? 0}x${size?.height ?? 0}.png` });
  void info;
}
async function open(page: Page, chamber: string, title: string, theme: 'day' | 'night') {
  await page.goto(`/#/chamber/${chamber}`);
  // The Deck opens in night; toggle only when the current theme differs.
  if (await page.locator('.cc-frame').getAttribute('data-theme') !== theme) await page.getByRole('button', { name: 'Toggle day and night' }).click();
  await expect(page.locator('.cc-frame')).toHaveAttribute('data-theme', theme);
  await dock(page).getByRole('button', { name: 'More flows' }).click();
  await page.getByRole('menuitem', { name: title }).click();
  await expect(dock(page)).toContainText('What should your');
}
async function holdToSeal(page: Page, done: RegExp) {
  // The Deck's dock also carries a seal key; seal from the confirm card itself.
  const hold = dock(page).locator('.cc-steward-confirm').getByRole('button', { name: /^hold to seal/i });
  await hold.focus(); await page.keyboard.down('Space');
  await expect(dock(page)).toContainText(done);
  await page.keyboard.up('Space');
}
const pickGroup = (page: Page) => dock(page).getByRole('group', { name: /These ready-made ones fit best/ });

const kinds = [
  { kind: 'beacon', chamber: 'visuals', title: 'Custom design · beacon', request: 'reactor core, cyberpunk', closest: 'Industrial Cyberpunk Realism' },
  { kind: 'frame', chamber: 'visuals', title: 'Custom design · facecam frame', request: 'ice, frozen', closest: 'Glacial Citadel' },
  { kind: 'vote_bar', chamber: 'moderator', title: 'Custom design · vote bar', request: 'runes', closest: 'Runeforged Iron' },
  { kind: 'draw_vessel', chamber: 'lottery', title: 'Custom design · draw vessel', request: 'halloween version pls', closest: 'Hallowed Night Gothic' },
] as const;

for (const theme of ['day', 'night'] as const) for (const item of kinds) {
  test(`custom design · ${item.kind} · ${theme}: library pick seals onto the SIMULATED preview`, async ({ page }, info) => {
    await open(page, item.chamber, item.title, theme);
    await expect(dock(page).getByRole('group', { name: 'Feel suggestions' }).getByRole('button')).toHaveCount(10);
    await shot(page, info, `${item.kind}-1-request-${theme}`);
    await dock(page).getByRole('textbox', { name: 'Feel' }).fill(item.request);
    await dock(page).getByRole('button', { name: 'Continue' }).click();
    const closest = pickGroup(page).getByRole('button', { name: new RegExp(`^${item.closest}`) });
    await expect(closest).toContainText('closest');
    await expect(pickGroup(page).getByRole('button', { name: /Make a new one/ })).toContainText('Simulated');
    await expect(closest.getByRole('img')).toHaveAttribute('src', /^\/art\/library\//);
    await shot(page, info, `${item.kind}-2-suggestions-${theme}`);
    await closest.click();
    const preview = dock(page).getByRole('figure', { name: new RegExp(`living preview · ${item.closest} · SIMULATED`) });
    await expect(preview).toContainText('SIMULATED');
    await expect(preview.getByRole('img').first()).toHaveAttribute('src', /^\/art\/library\//);
    await shot(page, info, `${item.kind}-3-preview-${theme}`);
    await dock(page).getByRole('button', { name: 'Use this', exact: true }).click();
    await expect(dock(page)).toContainText('This preview session only · SIMULATED');
    await shot(page, info, `${item.kind}-4-seal-${theme}`);
    await holdToSeal(page, new RegExp(`Sealed\\. .*"${item.closest}"`));
    if (item.chamber === 'moderator') {
      // The Deck keeps the herald's vote bar in the Gatehouse drawer.
      const lower = page.getByRole('button', { name: 'Lower Esc', exact: true });
      if (await lower.count()) await lower.click();
      await page.getByRole('button', { name: 'Full chart', exact: true }).click();
      const drawer = page.getByRole('dialog', { name: 'The Herald and more of the Gatehouse', exact: true });
      await expect(drawer.locator('.gh-herald .gh-votebar')).toHaveAttribute('data-art', 'votebar-11');
    }
    if (item.chamber === 'visuals') await expect(page.getByRole('region', { name: 'Beacon picture' }).locator('img[src^="/art/library/"]').first()).toBeVisible();
    await shot(page, info, `${item.kind}-5-sealed-${theme}`);
  });
}

for (const theme of ['day', 'night'] as const) test(`custom design · make a new one · ${theme}: size, one question, SIMULATED generation, try again`, async ({ page }, info) => {
  await open(page, 'visuals', 'Custom design · beacon', theme);
  await dock(page).getByRole('group', { name: 'Feel suggestions' }).getByRole('button', { name: 'Forged Volcanic Brazier' }).click();
  await pickGroup(page).getByRole('button', { name: /Make a new one/ }).click();
  await expect(dock(page)).toContainText('fits your OBS canvas');
  await shot(page, info, `new-1-size-${theme}`);
  await dock(page).getByRole('button', { name: /Tall and detailed · 1152 × 1536/ }).click();
  const question = dock(page).getByRole('group', { name: /How bright should the core burn\?/ });
  await expect(question.getByRole('button', { name: /Bold flare/ })).toContainText('assumed');
  await shot(page, info, `new-2-question-${theme}`);
  await question.getByRole('button', { name: /Wild blaze/ }).click();
  const working = dock(page).getByRole('status').filter({ hasText: /Reading your request|Art direction|SIMULATED: picking/ });
  await expect(working).toBeVisible();
  await expect(dock(page).getByText('SIMULATED · nothing is generated and nothing is spent.')).toBeVisible();
  await shot(page, info, `new-3-generating-${theme}`);
  const preview = dock(page).getByRole('figure', { name: /Beacon living preview · .* · SIMULATED/ });
  await expect(preview).toBeVisible({ timeout: 10_000 });
  await expect(dock(page)).toContainText('SIMULATED · closest library art stands in for a new image');
  await expect(dock(page)).toContainText('1152 × 1536');
  await shot(page, info, `new-4-preview-${theme}`);
  const first = await preview.getAttribute('aria-label');
  await dock(page).getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(preview).not.toHaveAttribute('aria-label', first ?? '', { timeout: 10_000 });
  await dock(page).getByRole('button', { name: 'Use this', exact: true }).click();
  await holdToSeal(page, /Sealed\. The Offering altar now wears/);
  await shot(page, info, `new-5-sealed-${theme}`);
});
