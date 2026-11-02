import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { guardPage } from './network.ts';
import { auditStyles, desktopSurfaces } from './styles.ts';
import { buildCoreLauncher, startCore } from './core-launch.ts';

import { lotSteward } from './lots-steward.ts';

// The desktop fixture journey stays independent of the real-core OBS proof. Setup is a
// Steward flow: one decision per card, the stage previews the draft, one hold seals.
async function configureAndCast(page: Page) {
  await page.goto('/#/chamber/lottery');
  await expect(page.locator('.cc-rampart > [data-stamp="simulated"]')).toHaveText('Simulated');
  // The hall holds the picture and the roll, not a form.
  const hall = page.getByRole('region', { name: 'Lot Chamber', exact: true });
  await expect(hall).toBeVisible();
  await expect(hall.locator('[data-role="room-picture"]')).toHaveCount(1);
  await expect(hall.getByRole('region', { name: 'The roll', exact: true })).toBeVisible();
  await expect(hall.getByRole('textbox', { name: 'Draw name', exact: true })).toHaveCount(0);
  const steward = lotSteward(page);
  const stage = page.locator('.lottery-draw-stage');
  await steward.chip('Set up a draw');
  await steward.pick('Free-entry prize');
  await steward.pick('Anyone who types !join');
  await steward.pick('3 · the hearth');
  await steward.pick('Let me choose each');
  await steward.pick('1 of 3 winners');
  await steward.pick('10 minutes');
  await steward.pick('Activity counts a little');
  await steward.field('25');
  // Compliance arrives as the next step, one fix at a time.
  await expect(steward.prompt('A prize draw needs official rules attached before it can seal.')).toBeVisible();
  await expect(steward.sheet.getByRole('button', { name: 'Hold to seal', exact: true })).toHaveCount(0);
  await steward.pick('Attach the rules template');
  await expect(steward.prompt('Viewers must be told that Twitch is not behind this prize.')).toBeVisible();
  await steward.pick('Acknowledge the disclaimer');
  await steward.pick('Wheel');
  // The stage is the live preview of the draft.
  await expect(stage).toHaveAttribute('data-shape', 'wheel');
  await expect(page.getByRole('region', { name: 'The roll', exact: true })).toContainText('Draft · not sealed');
  await expect(steward.sheet).toContainText('Clear · free entry, rules attached, Twitch disclaimer acknowledged');
  await steward.next('Looks right');
  await steward.hold(page.locator('.lottery-roll[data-tone="sealed"]'));
  await expect(page.locator('[data-role="lot-roll-panel"]')).toContainText('Sealed · the roll is frozen, waiting for the cast');
  await expect(page.locator('[data-role="lot-draw-card"]')).toContainText('Free-entry prize');
  await auditStyles(page, desktopSurfaces);
  await steward.chip('Cast the lots');
  await steward.next('The round is ready');
  await steward.pick('One by one, quietly');
  await steward.hold(page.locator('.lottery-roll[data-tone="cast"]'));
  await page.getByRole('button', { name: /^Lower/ }).click();
  const trigger = hall.getByRole('button', { name: 'The writ and draw tools', exact: true });
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
  const drawer = page.getByRole('dialog', { name: 'The writ and the draw tools', exact: true });
  await expect(drawer).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const result = drawer.getByRole('region', { name: 'Current SIMULATED cast', exact: true });
  await expect(result).toContainText('SIMULATED');
  await expect(result.locator('[data-current-winner]')).toHaveCount(3);
  await result.getByRole('button', { name: 'Read current simulated writ', exact: true }).click();
  await expect(drawer.getByRole('region', { name: 'Current simulated writ', exact: true })).toContainText('Not a cc-verify proof');
  return result;
}

test('a paid-weight prize is stopped by a Steward step until the paid weight goes', async ({ page }) => {
  const verify = await guardPage(page);
  try {
    await page.goto('/#/chamber/lottery');
    const steward = lotSteward(page);
    await steward.chip('Set up a draw');
    await steward.pick('Paid-weight prize');
    await steward.pick('Everyone chatting');
    await steward.pick('3 · the hearth');
    await steward.pick('Balanced');
    await expect(steward.prompt('money may never buy entry or better odds')).toBeVisible();
    await expect(steward.sheet.getByRole('button', { name: 'Hold to seal', exact: true })).toHaveCount(0);
    await steward.pick('Remove paid weight');
    await expect(steward.prompt('What is the prize worth, in US dollars?')).toBeVisible();
    // The sheet offers Back, Start over and Lower (no Put away): starting over drops every answer, nothing sealed.
    await steward.sheet.getByRole('button', { name: 'Start over', exact: true }).click();
    await expect(steward.sheet.getByRole('list', { name: 'Answered so far', exact: true })).toHaveCount(0);
    await expect(steward.prompt('What is the prize worth, in US dollars?')).toHaveCount(0);
    await expect(page.locator('.lottery-roll[data-tone="sealed"]')).toHaveCount(0);
  } finally { await page.goto('about:blank'); verify(); }
});

test('Play demo seals, casts and reveals a SIMULATED draw from one hold', async ({ page }) => {
  const verify = await guardPage(page);
  try {
    await page.goto('/#/chamber/lottery');
    const steward = lotSteward(page);
    await steward.chip('Play demo');
    await expect(steward.sheet.locator('.cc-sim').first()).toBeVisible();
    const sandbox = page.getByRole('note', { name: 'Demo sandbox', exact: true });
    await expect(sandbox).toContainText('Demo sandbox · SIMULATED · nothing touches your core');
    await steward.pick('Questions for the hall');
    await steward.next('Looks fair');
    await steward.hold(page.locator('.lottery-roll[data-tone="cast"]'));
    await expect(page.locator('.lottery-draw-stage')).toHaveAttribute('data-phase', 'revealed');
    await expect(page.locator('[data-stage-winner]')).toHaveCount(3);
    // The closing beat and its next steps stay in the raised sheet until the streamer acts.
    await expect(steward.sheet).toContainText('Sealed and cast');
    await expect(steward.sheet.getByRole('button', { name: 'Set up a real draw', exact: true })).toBeVisible();
    await expect(sandbox).toBeVisible();
    await sandbox.getByRole('button', { name: 'Leave the demo', exact: true }).click();
    await expect(sandbox).toHaveCount(0);
    await expect(steward.sheet.locator('[data-role="steward-bubble"]').filter({ hasText: 'Sealed and cast' }).last()).toBeVisible();
  } finally { await page.goto('about:blank'); verify(); }
});

test('lottery set up, seal, cast and writ journey through the Steward', async ({ page }) => {
  const verify = await guardPage(page);
  try {
    await configureAndCast(page);
  } catch (error) {
    await page.goto('about:blank').catch(cleanupError => {
      console.error('Failed to navigate away after the Lots journey error:', cleanupError);
    });
    throw error;
  }
  await page.goto('about:blank');
  verify();
});

test.describe('lottery CORE simulated cast OBS journey', () => {
  test.beforeAll(async () => {
    test.setTimeout(600_000); // A cold Cargo build happens before browser assertions.
    await buildCoreLauncher();
  });
  test('accepted seal and cast render the real core winners', async ({ page }) => {
    const core = await startCore();
    try {
      const verify = await guardPage(page, core.overlayOrigin);
      try {
        // Node carries the capability through invokeMethod. Vite/browser origins
        // remain untrusted and receive neither RPC access nor a session token.
        const contract = core.contract;
        const draw = await core.invoke(contract.lotsDrawUpsert, { draw: {
          draw_id: 'simulated-core-draw', name: 'SIMULATED audience questions',
          policy: { content: 'question', paid_entry: false, paid_weight: false,
            subscriber_only: false, channel_points: false, free_entry_equal_odds: true,
            regions: [], prize_value_usd_cents: 0, registration_confirmed: false,
            official_rules: true, twitch_disclaimer: true },
          rules: { pool: { kind: 'chatters' }, winner_count: 3, cooldown_s: 0,
            cohort_caps: [], weight_curve: { kind: 'equal' }, free_join_equal_odds: true },
        } });
        expect(await core.invoke(contract.lotsDrawCheck, { policy: draw.policy }))
          .toEqual({ result: 'ok', reasons: [] });
        // The last generated participant proves the Rust intake finished before
        // sealing; no fixture endpoint can create or replace an entry.
        await expect.poll(async () => (await core.invoke(contract.lotsRollLookup,
          { draw_id: draw.draw_id, user_id: '111' })).entry?.user_id).toBe('111');
        const sealed = await core.invoke(contract.lotsRollSeal,
          { draw_id: draw.draw_id, source: 'drand_quicknet', margin_s: 1 });
        expect(sealed.sealed.roll.entries).toHaveLength(12);
        // Winners are proof handles (Twitch user ids), not logins.
        const generated = Array.from({ length: 12 }, (_, i) => String(100 + i));
        const handles = sealed.sealed.roll.entries.map(e => e.handle);
        expect([...handles].sort()).toEqual([...generated].sort());
        const cast = await core.invoke(contract.lotsCast, { draw_run_id: sealed.draw_run_id });
        expect(cast.cast.seal).toBe(sealed.sealed.seal);
        expect(cast.cast.winners).toHaveLength(3);
        expect(new Set(cast.cast.winners).size).toBe(3);
        for (const winner of cast.cast.winners) {
          expect(generated).toContain(winner);
          expect(handles).toContain(winner);
        }
        // Both configured projects exercise this page at their actual viewport.
        await page.goto(`${core.overlayOrigin}/lots/${draw.draw_id}?scale=1&anchor=tl`);
        await expect(page.locator('main')).toHaveAttribute('data-simulated', 'true');
        await expect(page.locator('.draw-scene .simulated')).toHaveText('SIMULATED');
        await expect(page.locator('[data-draw-winner]')).toHaveText(cast.cast.winners);
        const island = await page.locator('#cc-cast').textContent();
        if (!island) throw new Error('Missing accepted cast on the real core page');
        expect(contract.parseMethodResult(contract.lotsCast, island)).toEqual(cast);
        await auditStyles(page, [{ name: 'draw plate', selector: 'main' }], { canvas: 'obs-transparent' });
        expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
      } catch (error) {
        await page.goto('about:blank').catch(cleanupError => {
          console.error('Failed to navigate away after the Lots core journey error:', cleanupError);
        });
        throw error;
      }
      await page.goto('about:blank');
      // The overlay document and its same-origin /bundle.js must both be walked.
      expect(verify()).toBeGreaterThanOrEqual(2);
    } finally { await core.close(); }
  });
});

for (const [width, height] of [[1280, 720], [1366, 768], [1600, 900], [1920, 1080]] as const) {
  test(`Lot chamber controls fit without scrolling at ${width}x${height}`, async ({ page }) => {
    const verify = await guardPage(page);
    try {
      await page.setViewportSize({ width, height });
      await page.goto('/#/chamber/lottery');
      const room = page.getByRole('region', { name: 'Lot Chamber', exact: true });
      await expect(room).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const content = page.locator('.shell-room-content');
      await expect.poll(() => content.evaluate(element => element.scrollHeight - element.clientHeight)).toBe(0);
      await expect.poll(() => room.evaluate(element => {
        const issues: string[] = [];
        const bounds = element.getBoundingClientRect();
        const nodes = [document.documentElement, element, ...element.querySelectorAll<HTMLElement>('*')];
        for (const node of nodes) {
          if (!node.getClientRects().length) continue;
          const style = getComputedStyle(node);
          if (style.visibility === 'hidden' || style.position === 'absolute' || node.closest('.cc-sr')) continue;
          const frame = node === document.documentElement || node === element || node.matches('.cc-chamber-column, .cc-chamber-mini, [data-role="room-section"]');
          if ((frame || /auto|scroll/.test(style.overflow)) && (node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1)) issues.push(`scroll ${node.className}`);
          if (frame && node !== document.documentElement && node.getBoundingClientRect().bottom > bounds.bottom + 1) issues.push(`outside ${node.className}`);
        }
        for (const selector of ['.lottery-stage-options button', '.lottery-primary-actions > button', '.lottery-roll-legend li']) {
          const controls = [...element.querySelectorAll<HTMLElement>(selector)];
          const tops = controls.map(control => control.getBoundingClientRect().top);
          if (tops.length && Math.max(...tops) - Math.min(...tops) > 1) issues.push(`row wraps ${selector}`);
          for (const control of controls) {
            if (control.scrollWidth > control.clientWidth) issues.push(`control overflows ${selector}`);
            for (const text of [...control.childNodes].filter(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())) {
              const range = document.createRange(); range.selectNodeContents(text);
              if (range.getClientRects().length > 1) issues.push(`text wraps ${text.textContent}`);
            }
          }
        }
        const trigger = [...element.querySelectorAll('button')].find(button => button.textContent?.includes('The writ and draw tools'));
        if (!trigger) issues.push('missing tools trigger');
        else if (trigger.getBoundingClientRect().bottom > bounds.bottom - 1) issues.push('tools trigger on or below bottom edge');
        return issues;
      })).toEqual([]);
      await expect(room.locator('.lottery-primary-actions > button')).toHaveCount(3);
      for (const name of ['Set up a draw', 'Cast the lots', 'The writ and draw tools']) {
        await expect(room.getByRole('button', { name, exact: true }).locator('.cc-key-badge')).toBeVisible();
      }
    } finally { await page.goto('about:blank'); verify(); }
  });
}
