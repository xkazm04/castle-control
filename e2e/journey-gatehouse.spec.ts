import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { guardPage } from './network.ts';
import { auditFields, auditStyles, desktopSurfaces } from './styles.ts';

async function seal(page: Page) {
  const button = page.getByRole('button', { name: 'Hold to seal', exact: true });
  await button.focus();
  await page.keyboard.down('Space');
  await expect(page.getByRole('button', { name: 'Hold to seal', exact: true })).toHaveCount(0);
  await page.keyboard.up('Space');
}

test('Gatehouse actions identify targets and expose one notice and count region', async ({ page }) => {
  const verify = await guardPage(page);
  try {
    await page.goto('/#/chamber/moderator');
    const notice = page.locator('[data-review-feedback]');
    const expectNotice = async (message: string) => {
      await expect(notice).toHaveText(message);
      await expect(page.getByRole('status').filter({ hasText: message })).toHaveCount(1);
    };
    await expectNotice('Nothing sent.');
    const cards = page.locator('.moderator-rule-card');
    await expect(cards).toHaveCount(3);
    for (const card of await cards.all()) {
      const rule_name = await card.locator('.moderator-rule-text b').innerText();
      await expect(card.getByRole('button', { name: 'Propose Arm', exact: true })).toHaveAccessibleDescription(rule_name);
    }
    await cards.first().getByRole('button', { name: 'Propose Arm', exact: true }).click();
    await seal(page);
    await expect(cards.first().getByRole('button', { name: 'Propose Watch', exact: true })).toHaveAccessibleDescription('Links');
    for (const name of ['Propose Ban', 'Propose Dismiss']) {
      await expect(page.getByRole('button', { name, exact: true })).toHaveAccessibleDescription('simulated-message-26');
    }
    const entries = page.locator('.moderator-roll-entry');
    await expect(entries).toHaveCount(3);
    for (const [index, entry] of (await entries.all()).entries()) {
      for (const button of await entry.getByRole('button').all()) {
        await expect(button).toHaveAccessibleDescription(`simulated-message-${5003 + index}`);
      }
    }
    await expect(page.locator('.moderator-roll-message[tabindex]')).toHaveCount(0);
    const bench = page.getByRole('region', { name: 'Rule bench', exact: true });
    await expect(bench.getByRole('status')).toHaveCount(1);
    await expect(bench.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    await expect(bench.getByRole('status').locator('output, [role="status"], [aria-live]')).toHaveCount(0);
    for (const label of ['Draft pattern hits', 'Would newly act on']) {
      await expect(bench.getByLabel(label, { exact: true })).toHaveCount(1);
    }
    for (const action of ['Raise the drawbridge', 'Lower the drawbridge']) {
      const shield = page.getByRole('button', { name: `${action} Shield Mode · fixture only`, exact: true });
      await expect(shield).toHaveAccessibleName(`${action} Shield Mode · fixture only`);
      await expect(shield).not.toHaveAttribute('aria-label');
      await shield.click();
      await seal(page);
      await expectNotice('Awaiting fixture confirmation. Applied settings are unchanged.');
      await expectNotice('Fixture confirmed. Nothing sent to Twitch.');
    }
  } finally { await page.goto('about:blank'); verify(); }
});

test('Gatehouse Rule bench previews a watching draft on chat and in the drill', async ({ page }) => {
  const verify = await guardPage(page);
  const requests: string[] = [];
  try {
    await page.goto('/#/chamber/moderator');
    await page.getByRole('combobox', { name: 'Watching rule', exact: true }).selectOption('');
    await page.waitForLoadState('networkidle');
    page.on('request', request => requests.push(request.url()));
    await page.getByRole('textbox', { name: 'Watching rule name' }).fill('Caps lock!');
    await page.getByRole('textbox', { name: 'Watching match pattern' }).fill('go left');
    await expect(page.getByLabel('Draft pattern hits', { exact: true })).toHaveText('166 draft pattern hits');
    await expect(page.getByLabel('Would newly act on', { exact: true })).toContainText('166');
    await expect(page.locator('[data-draft-match="true"]').first()).toBeVisible();
    await page.getByRole('button', { name: 'Draft matches', exact: false }).click();
    await expect(page.locator('.moderator-feed [data-message-row]:not([data-draft-match="true"])')).toHaveCount(0);
    await page.getByRole('link', { name: 'Run the drill', exact: true }).click();
    const preview = page.getByRole('region', { name: 'Draft pattern preview', exact: true });
    await expect(preview).toBeVisible(); await expect(preview).toContainText('166 draft pattern hits');
    await expect(preview).not.toContainText(/instrument.hash/i);
    expect(requests).toEqual([]);
  } finally { await page.goto('about:blank'); verify(); }
});

test('Gatehouse shadow journey and transparent stream previews', async ({ page }) => {
  const verify = await guardPage(page);
  try {
    await page.goto('/#/chamber/moderator');
    await expect(page.locator('.cc-sample')).toHaveText('Simulated');
    await expect(page.locator('.moderator-room')).toContainText('SIMULATED');
    await page.getByRole('textbox', { name: 'Watching rule name' }).fill('Links for review');
    await page.getByRole('textbox', { name: 'Watching match pattern' }).fill('https?://');
    await page.getByRole('button', { name: 'Propose watching rule', exact: true }).click();
    await seal(page);
    await expect(page.locator('.moderator-orders')).toContainText('Links for review');
    await page.getByRole('combobox', { name: 'Propose chat delay', exact: true }).selectOption('6');
    await seal(page);
    await expect(page.locator('.moderator-moat .cc-hero-figure')).toHaveAttribute('data-text', '6');
    const play = page.getByRole('button', { name: 'Play simulated chat', exact: true });
    await expect(play).not.toHaveAttribute('aria-pressed');
    await play.click();
    await expect(page.locator('[data-chat-arrivals]')).not.toHaveText('0 new simulated lines');
    const pause = page.getByRole('button', { name: 'Pause simulated chat', exact: true });
    await expect(pause).not.toHaveAttribute('aria-pressed');
    await pause.click();
    await expect(page.locator('.moderator-held')).toContainText('Held for review');
    await page.getByRole('button', { name: 'Propose Pass', exact: true }).click();
    await seal(page);
    await expect(page.locator('.moderator-held-plate')).toContainText('The portcullis is clear');
    await expect(page.locator('[data-review-feedback]')).toContainText('Released');
    await page.getByRole('button', { name: 'Propose Undo', exact: true }).click();
    await seal(page);
    await expect(page.locator('[data-review-feedback]')).toContainText('undo');
    await page.getByRole('button', { name: 'Emotes only', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Emotes only', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('link', { name: 'Run the drill', exact: true }).click();
    await expect(page.locator('.moderator-drill')).toContainText('Recording gap');
    await expect(page.locator('.moderator-drill')).toContainText('live parity: pending capture evidence');
    await page.getByRole('link', { name: '← Back to the Gatehouse', exact: true }).click();
    for (const layer of ['Chat overlay', 'Vote bar']) {
      await page.getByRole('combobox', { name: `${layer} size`, exact: true }).selectOption('L');
      await page.getByRole('combobox', { name: `${layer} anchor`, exact: true }).selectOption('top-right');
      await page.getByRole('combobox', { name: `${layer} colour`, exact: true }).selectOption('gules');
      await page.getByRole('combobox', { name: `${layer} art style`, exact: true }).selectOption('pixel');
      await page.getByRole('spinbutton', { name: `${layer} show after (ms)`, exact: true }).fill('-5');
      await page.getByRole('spinbutton', { name: `${layer} hide after (ms)`, exact: true }).fill('999999');
      await page.getByRole('spinbutton', { name: `${layer} hide after (ms)`, exact: true }).press('Tab');
    }
    for (const resolution of ['1920x1080', '1280x720']) {
      const preview = page.locator(`[data-output-frame="${resolution}"]`);
      await expect(preview).toBeVisible();
      await expect(preview).toHaveAttribute('data-transparent', 'true');
      await expect(preview.locator('[data-output-layer="vote"]')).toHaveAttribute('data-size', 'L');
      await expect(preview.locator('[data-output-layer="chat"]')).toHaveAttribute('data-anchor', 'top-right');
      await expect(preview.locator('image')).toHaveAttribute('href', '/art/preset-pixel-votebar.webp');
      await expect(preview).toContainText('SIMULATED');
    }
    await expect(page.getByRole('spinbutton', { name: 'Vote bar show after (ms)', exact: true })).toHaveValue('0');
    await expect(page.getByRole('spinbutton', { name: 'Vote bar hide after (ms)', exact: true })).toHaveValue('60000');
    await expect(page.locator('.moderator-output')).toContainText('Session only');
    await auditStyles(page, desktopSurfaces);
    await auditFields(page);
  } finally {
    await page.goto('about:blank');
    verify();
  }
});
