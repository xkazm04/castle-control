import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { guardPage } from './network.ts';
import { auditFields, auditStyles, desktopSurfaces } from './styles.ts';

/** Hold the one visible "Hold to seal" (a seal-slot proposal or the Steward's confirm card) until it acts. */
async function seal(page: Page) {
  const button = page.getByRole('button', { name: 'Hold to seal', exact: true });
  if (!await button.count()) await openMore(page);
  await button.focus();
  await page.keyboard.down('Space');
  await expect(page.getByRole('button', { name: 'Hold to seal', exact: true })).toHaveCount(0);
  await page.keyboard.up('Space');
}
const drawer = (page: Page) => page.getByRole('dialog', { name: 'The Herald and more of the Gatehouse', exact: true });
/** The full chart, vote bar, benches and proposal list live in the one room drawer. */
async function openMore(page: Page) {
  // A sealed flow leaves its receipt in the raised Steward sheet; lower it to reach the room below.
  const lower = page.getByRole('button', { name: 'Lower Esc', exact: true });
  if (await lower.count()) await lower.click();
  if (!await drawer(page).count()) await page.getByRole('button', { name: 'Full chart', exact: true }).click();
  await expect(drawer(page)).toBeVisible();
  const more = drawer(page).locator('details.gh-more');
  if (!await more.evaluate(element => (element as HTMLDetailsElement).open)) await more.locator('summary').click();
  await expect(more).toHaveAttribute('open', '');
}
async function closeMore(page: Page) {
  if (await drawer(page).count()) await drawer(page).getByRole('button', { name: 'Close The Herald and more of the Gatehouse', exact: true }).click();
}
const steward = (page: Page) => page.getByRole('region', { name: 'The Steward', exact: true });
async function chip(page: Page, name: string) {
  await steward(page).getByRole('group', { name: 'Steward suggestions' }).getByRole('button', { name, exact: true }).click();
}
async function pick(page: Page, name: string) {
  await steward(page).locator('.cc-steward-step').getByRole('button', { name: new RegExp(`^${name}`) }).click();
}
async function looksRight(page: Page, label = 'Looks right') {
  await steward(page).locator('.cc-steward-step').getByRole('button', { name: label, exact: true }).click();
}

test('Gatehouse chamber fits both laptop budgets and the full chart/benches remain reachable', async ({ page }) => {
  const verify = await guardPage(page);
  try {
    for (const viewport of [{ width: 1280, height: 720 }, { width: 1366, height: 768 }]) {
      await page.setViewportSize(viewport); await page.goto('/#/chamber/moderator');
      const room = page.locator('.gh-deck');
      await expect(room.locator('.cc-chamber-layout')).toHaveCount(1);
      await expect(room.locator('.cc-chamber-column')).toHaveCount(2);
      await expect(room.locator('[data-role="room-section"]')).toHaveCount(3);
      const picture = await room.locator('[data-role="room-picture"]').boundingBox();
      if (!picture) throw new Error('Missing Gatehouse picture');
      expect(Math.abs(picture.width / picture.height - 16 / 9)).toBeLessThan(.02);
      const overflow = await room.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        return [...element.querySelectorAll<HTMLElement>('.cc-chamber-column, .cc-chamber-mini, [data-role="room-section"]')]
          .filter(item => { const box = item.getBoundingClientRect(); return box.bottom > bounds.bottom + 1 || box.right > bounds.right + 1
            || item.scrollHeight > item.clientHeight + 1 || item.scrollWidth > item.clientWidth + 1; })
          .map(item => item.getAttribute('aria-label') ?? item.className);
      });
      expect(overflow).toEqual([]);
      const scroll = await page.locator('.shell-room-content').evaluate(element => element.scrollHeight - element.clientHeight);
      expect(scroll).toBeLessThanOrEqual(1);
      const bodyCopy = room.locator('.gh-held__msg, .gh-held__why, .gh-notice, .gh-needs__facts dd, .moderator-tile span');
      for (const item of await bodyCopy.all()) {
        const style = await item.evaluate(element => {
          const value = getComputedStyle(element);
          return { size: parseFloat(value.fontSize), line: parseFloat(value.lineHeight) };
        });
        expect(style.size).toBe(15); expect(style.line).toBeCloseTo(21.75, 1);
      }
      await page.screenshot({ path: test.info().outputPath(`gatehouse-${viewport.width}.png`) });
      await page.getByRole('button', { name: 'Review queue · 1 held · 1 pending ban', exact: true }).click();
      await expect(drawer(page).getByRole('button', { name: 'Propose Ban', exact: true })).toBeVisible();
      await expect(drawer(page)).toContainText('simulated-message-26');
      await closeMore(page);
      await openMore(page);
      for (const text of ['Rule bench', 'The moat', 'Garrison orders', 'Stream output preview', 'Custom design']) await expect(drawer(page)).toContainText(text);
      await expect(drawer(page).locator('[aria-rowcount="420"]')).toHaveCount(1);
      await expect(drawer(page).getByRole('link', { name: 'Run the drill', exact: true })).toBeVisible();
      await drawer(page).locator('details.gh-more > summary').click();
      await expect(drawer(page)).toBeVisible();
      await page.keyboard.press('Escape'); await expect(drawer(page)).toHaveCount(0);
      await expect(page).toHaveURL(/#\/chamber\/moderator$/);
    }
  } finally { await page.goto('about:blank'); verify(); }
});

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
    await openMore(page);
    await expect(drawer(page).getByRole('region', { name: 'Gate status details', exact: true })).toContainText('1 held message and 1 pending ban need you.');
    for (const name of ['Propose Ban', 'Propose Dismiss']) {
      await expect(page.getByRole('button', { name, exact: true })).toHaveAccessibleDescription('simulated-message-26');
    }
    await openMore(page);
    const cards = page.locator('.moderator-rule-card');
    await expect(cards).toHaveCount(3);
    for (const card of await cards.all()) {
      const rule_name = (await card.locator('.moderator-rule-text b').textContent() ?? '').trim();
      await expect(card.getByRole('button', { name: 'Propose Arm', exact: true })).toHaveAccessibleDescription(rule_name);
    }
    await cards.first().getByRole('button', { name: 'Propose Arm', exact: true }).click();
    await seal(page);
    await expect(cards.first().getByRole('button', { name: 'Propose Watch', exact: true })).toHaveAccessibleDescription('Links');
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
    for (const [action, pressed] of [['Raise the drawbridge', 'true'], ['Lower the drawbridge', 'false']] as const) {
      await closeMore(page);
      const shield = page.getByRole('button', { name: action, exact: true });
      await expect(shield).toHaveAccessibleName(action);
      await expect(shield).not.toHaveAttribute('aria-label');
      await shield.click();
      await seal(page);
      // The pending notice lasts one fixture confirmation (400 ms); under load the page may only be
      // sampled after it. Accept either honest state, then require the confirmed one and the result.
      await expect(notice).toHaveText(/^(Awaiting fixture confirmation\. Applied settings are unchanged\.|Fixture confirmed\. Nothing sent to Twitch\.)$/);
      await expectNotice('Fixture confirmed. Nothing sent to Twitch.');
      await expect(page.locator('.gh-shield button')).toHaveAttribute('aria-pressed', pressed);
    }
  } finally { await page.goto('about:blank'); verify(); }
});

test('Gatehouse Rule bench previews a watching draft on chat and in the drill', async ({ page }) => {
  const verify = await guardPage(page);
  const requests: string[] = [];
  try {
    await page.goto('/#/chamber/moderator');
    await openMore(page);
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

test('Gatehouse Steward flows set the rules and the vote bar; nothing acts before the seal', async ({ page }) => {
  const verify = await guardPage(page);
  try {
    await page.goto('/#/chamber/moderator');
    await expect(page.locator('.cc-rampart > [data-stamp="simulated"]')).toHaveText('Simulated');
    await expect(page.locator('.moderator-room')).toContainText('Simulated');
    const needs = page.getByRole('region', { name: 'What needs you', exact: true });
    await expect(needs).toContainText('4 s');

    await chip(page, 'Set the rules');
    await pick(page, 'Family evening');
    await pick(page, 'Siege');
    await pick(page, 'Bar blocked terms, hold the rest');
    // The gate draws the draft while the sheet is raised; nothing has changed yet.
    await expect(page.locator('.gh-ribbon')).toContainText('Family evening · chat waits 6 s · Blocked terms barred');
    await expect(steward(page).locator('.gh-fates')).toContainText('Link questions');
    await looksRight(page);
    await expect(needs).toContainText('4 s');
    await seal(page);
    await expect(steward(page)).toContainText('Sealed: added Link questions, Blocked terms barred, chat delay 6 s.');
    await expect(needs).toContainText('6 s');
    await openMore(page);
    await expect(page.locator('.moderator-orders')).toContainText('Link questions');
    await expect(page.locator('.moderator-moat .cc-hero-figure')).toHaveAttribute('data-text', '6');

    await chip(page, 'Show the vote bar');
    await pick(page, 'Emotes only');
    await pick(page, 'Across the top, large');
    await pick(page, 'Neon');
    const canvas = drawer(page).locator('.gh-herald .gh-stage__canvas');
    await expect(canvas).toHaveAttribute('data-anchor', 'top-left');
    await expect(page.locator('.gh-herald .gh-stage figcaption')).toContainText('Draft');
    await looksRight(page);
    await seal(page);
    await expect(canvas).toHaveAttribute('data-size', 'L');
    await expect(page.locator('.gh-herald .gh-votebar')).toHaveAttribute('data-art-style', 'synthwave');
    await expect(drawer(page).locator('.gh-herald').getByRole('button', { name: 'Emotes only', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.gh-herald .gh-stage figcaption')).not.toContainText('Draft');
  } finally { await page.goto('about:blank'); verify(); }
});

test('Gatehouse shadow journey and transparent stream previews', async ({ page }) => {
  const verify = await guardPage(page);
  try {
    await page.goto('/#/chamber/moderator');
    await openMore(page);
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
    await closeMore(page);
    await openMore(page);
    await expect(drawer(page).locator('.moderator-held')).toContainText('Held for review');
    await closeMore(page);
    await page.getByRole('button', { name: 'Propose Pass', exact: true }).click();
    await seal(page);
    await expect(page.locator('.moderator-held-plate[data-compact="true"]')).toContainText('The portcullis is clear');
    await expect(page.locator('.gh-gate-art')).toHaveAttribute('data-raised', 'true');
    await expect(page.locator('[data-review-feedback]')).toContainText('Released');
    await page.getByRole('button', { name: 'Propose Undo', exact: true }).click();
    await seal(page);
    await expect(page.locator('[data-review-feedback]')).toContainText('undo');
    await drawer(page).getByRole('button', { name: 'Emotes only', exact: true }).click();
    await expect(drawer(page).getByRole('button', { name: 'Emotes only', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('link', { name: 'Run the drill', exact: true }).click();
    await expect(page.locator('.moderator-drill')).toContainText('Recording gap');
    await expect(page.locator('.moderator-drill')).toContainText('live parity: pending capture evidence');
    await page.getByRole('link', { name: '← Back to the Gatehouse', exact: true }).click();
    await openMore(page);
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
    // The bench and the herald's vote bar read the same session output.
    await expect(page.locator('.gh-herald .gh-stage__canvas')).toHaveAttribute('data-anchor', 'top-right');
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

test('Gatehouse Play demo: a SIMULATED burst, one held line, your decision, the herald moves', async ({ page }) => {
  const verify = await guardPage(page);
  try {
    await page.goto('/#/chamber/moderator');
    const gate = page.getByRole('complementary', { name: 'At the portcullis', exact: true });
    const lead = page.locator('.gh-herald--compact .moderator-tile').first();
    await expect(lead).toContainText('36.7%');
    await chip(page, 'Play demo');
    await expect(steward(page).locator('.cc-steward-sheet__head')).toContainText('Simulated');
    await expect(gate.getByRole('list', { name: 'Simulated chat burst', exact: true }).getByRole('listitem')).toHaveCount(8);
    await looksRight(page, 'Show me the held one');
    await expect(gate.getByRole('article', { name: 'Simulated held message', exact: true })).toContainText('may I share the link?');
    await expect(gate.locator('.gh-count b')).toHaveText('2');
    await pick(page, 'Propose pass');
    await expect(gate).toContainText('Draft · you propose Pass');
    // The herald reads the burst: the leader surges, on the chart and on the vote bar.
    await expect(lead).toContainText('46.2%');
    await expect(steward(page).locator('.gh-stage')).toContainText('Go left 46.2%');
    await looksRight(page);
    await seal(page);
    await expect(steward(page)).toContainText('That is the Gatehouse: the AI holds, you decide.');
    await expect(page.locator('[data-review-feedback]')).toHaveText('Released · Pass · fixture confirmed. Nothing sent to Twitch.');
    // The released note sits under the demo's own line, not under another held message.
    const decided = gate.getByRole('article', { name: 'Simulated held message', exact: true });
    await expect(decided).toContainText('may I share the link?');
    await expect(decided).toContainText('Sealed · Pass');
    await expect(page.getByRole('note', { name: 'Demo sandbox', exact: true })).toBeVisible();
    await expect(lead).toContainText('46.2%');
    await openMore(page);
    await expect(page.locator('.moderator-roll-entry').first()).toContainText('I wrote a boss guide');
  } finally { await page.goto('about:blank'); verify(); }
});

test('Gatehouse Practice a drill opens the drill as planned, from free text', async ({ page }) => {
  const verify = await guardPage(page);
  try {
    await page.goto('/#/chamber/moderator');
    await page.getByRole('textbox', { name: 'Talk to the Steward...' }).fill('practice a drill');
    await page.keyboard.press('Enter');
    await pick(page, 'Sample night');
    await pick(page, 'Beside candidate rules');
    await expect(page.locator('.gh-ribbon')).toContainText('Practice a drill · sample night · beside candidate rules');
    await looksRight(page, 'Ready');
    await expect(page).toHaveURL(/#\/chamber\/moderator$/);
    await seal(page);
    await expect(page).toHaveURL(/#\/chamber\/moderator\/drill$/);
    await expect(page.locator('.moderator-drill')).toBeVisible();
    await expect(page.locator('.moat-compare-toggle')).toHaveAttribute('aria-pressed', 'true');
  } finally { await page.goto('about:blank'); verify(); }
});
