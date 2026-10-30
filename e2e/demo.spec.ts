import { test, expect } from '@playwright/test';
import { guardPage } from './network.ts';

const styleOptions: readonly [string, string][] = [
  ['heraldic', 'Heraldic'], ['pixel', 'Arcade'], ['synthwave', 'Neon'],
  ['watercolor', 'Storybook'], ['anime', 'Cel'], ['glass', 'Glass'],
];
const shotOptions: readonly [string, string][] = [
  ['malakor-facecam', 'Facecam'], ['malakor-lair-wide', 'Lair'], ['malakor-laugh', 'Laugh'],
];

test('demo entry, Back and Escape return to the keep', async ({ page }) => {
  const verify = await guardPage(page);
  try {
    await page.goto('/#/keep');
    await page.getByRole('button', { name: 'See it on stream', exact: true }).click();
    await expect(page).toHaveURL(/#\/demo$/);
    await expect(page.getByRole('heading', { name: 'On stream', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Back to the keep' }).click();
    await expect(page).toHaveURL(/#\/keep$/);
    await expect(page.getByRole('button', { name: 'See it on stream', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'See it on stream', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/#\/keep$/);
    await expect(page.getByRole('button', { name: 'See it on stream', exact: true })).toBeFocused();
  } finally { await page.goto('about:blank'); verify(); }
});

test('atlas switchers keep visible plates and provenance across all 36 states', async ({ page }) => {
  const verify = await guardPage(page);
  try {
    await page.goto('/#/demo');
    for (const [style, label] of styleOptions) {
      await page.getByRole('button', { name: label, exact: true }).click();
      await expect(page.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-pressed', 'true');
      const images = page.locator('.demo-page .ov img, .demo-page .cam .frame, .demo-ext img');
      await expect(images).toHaveCount(8);
      for (const image of await images.all()) {
        await expect(image).toHaveAttribute('src', new RegExp(`^/art/preset-${style}-(urn|altar|votebar|hexmap|frame2)\\.webp$`));
      }
      for (const layout of ['Game + cam', 'Just chatting']) {
        await page.getByRole('button', { name: layout, exact: true }).click();
        for (const [shot, shotLabel] of shotOptions) {
          await page.getByRole('button', { name: shotLabel, exact: true }).click();
          await page.waitForFunction(() => [...document.querySelectorAll('.demo-page img')].every(image =>
            image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0));
          await expect(page.locator('.demo-page .sim')).toBeVisible();
          await expect(page.locator('.demo-page .sim')).toHaveText('SIMULATED · SAMPLE ART · AI-generated');
          await expect(page.locator('.demo-page .live')).toBeVisible();
          await expect(page.locator('.demo-page .bg')).toHaveAttribute('src', `/art/${layout === 'Game + cam'
            ? 'scene-warmap' : shot === 'malakor-facecam' ? 'malakor-lair-wide' : shot}.webp`);
          if (layout === 'Game + cam') await expect(page.locator('.demo-page .cam')).toBeVisible();
          else await expect(page.locator('.demo-page .cam')).toBeHidden();
          for (const plate of await page.locator('.demo-page .ov .plate').all()) await expect(plate).toBeVisible();
          // CSS visibility alone misses stage overflow; all four plates must fit.
          const clipped = await page.locator('.demo-page .stage').evaluate(stage => {
            const bounds = stage.getBoundingClientRect();
            return [...stage.querySelectorAll('.ov .plate, .sim, .live')].filter(label => {
              const rect = label.getBoundingClientRect();
              return rect.left < bounds.left || rect.top < bounds.top || rect.right > bounds.right || rect.bottom > bounds.bottom;
            }).map(label => label.textContent);
          });
          expect(clipped).toEqual([]);
        }
      }
    }
    await expect(page.locator('.demo-chat li')).toHaveCount(9);
    await expect(page.locator('.demo-ext')).toHaveCount(3);
  } finally { await page.goto('about:blank'); verify(); }
});
