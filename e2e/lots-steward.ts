import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/** The Lot Chamber's Steward flows, driven the way a streamer drives them: chips, option cards, one hold. */
export function lotSteward(page: Page) {
  const sheet = page.getByRole('group', { name: 'Steward conversation', exact: true });
  const chips = page.getByRole('group', { name: 'Steward suggestions', exact: true });
  return {
    sheet,
    /** Open a flow from the collapsed dock's chips. */
    async chip(label: string) {
      await expect(chips).toBeVisible();
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const quick = chips.getByRole('button', { name: label, exact: true });
      if (await quick.count()) await quick.click();
      else {
        await chips.getByRole('button', { name: 'More flows', exact: true }).click();
        await page.getByRole('menu', { name: 'Every Steward flow in this chamber', exact: true })
          .getByRole('menuitem', { name: new RegExp(`^${escaped}(?:\\s+(?:in progress|simulated))*$`) }).click();
      }
      await expect(sheet).toBeVisible();
    },
    /** Pick an option card by its leading label. */
    async pick(label: string) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      await sheet.locator('.cc-steward-step').getByRole('button', { name: new RegExp(`^${escaped}`) }).click();
    },
    async field(value: string) {
      const step = sheet.locator('.cc-steward-step');
      await step.getByRole('textbox').fill(value);
      await step.getByRole('button', { name: 'Continue', exact: true }).click();
    },
    async next(label = 'Looks right') {
      await sheet.getByRole('button', { name: label, exact: true }).click();
    },
    prompt: (text: string) => sheet.locator('.cc-steward-step__prompt').filter({ hasText: text }),
    /** Hold the confirm card's seal until `until` shows, then release. */
    async hold(until: Locator) {
      const hold = sheet.getByRole('button', { name: 'Hold to seal', exact: true });
      await hold.focus();
      await page.keyboard.down('Space');
      try { await expect(until).toBeVisible({ timeout: 10_000 }); }
      finally { await page.keyboard.up('Space'); }
    },
  };
}

/** Seal the sample draw and cast it from the "Cast the lots" flow, with the chosen reveal. */
export async function castSample(page: Page, reveal: 'One by one, quietly' | 'By hand' | 'Full ceremony' = 'One by one, quietly') {
  const steward = lotSteward(page);
  // Nothing is sealed yet, so the dock leads with setup; the draw card offers the cast directly.
  await page.getByRole('region', { name: 'Cast the lots', exact: true }).getByRole('button', { name: 'Cast the lots', exact: true }).click();
  await expect(steward.sheet).toBeVisible();
  await steward.pick('Seal the sample draw first');
  await steward.next('The round is ready');
  await steward.pick(reveal);
  await steward.hold(page.locator('.lottery-roll[data-tone="cast"]'));
}
