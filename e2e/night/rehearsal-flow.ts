// Generated SIMULATED scenarios only. Shared by the fake-peer and isolated OBS lanes.
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { NightCore } from './launch.ts';
import { SHELL_ORIGIN } from './launch.ts';
import { addStreamOutput, createVisualInUi, eventually, holdToSeal, viteOrigin } from './support.ts';
import { auditFields, auditStyles, desktopSurfaces } from '../styles.ts';
import { guardPage } from '../network.ts';

export const rehearsalVisual = 'simulated-rehearsal-beacon';
export const rehearsalScene = 'Castle Control · Rehearsal';
export const rehearsalSourceNames = ['Castle Control · Lot plate', 'Castle Control · Gatehouse vote bar', 'Castle Control · SIMULATED rehearsal beacon'];

/** Leave a populated scene for optional OBS screenshots, then remove through the UI hold. */
export async function dressRehearsalInUi(page: Page, core: NightCore, beforeClear?: () => Promise<void>) {
  const kinds = new Set<string>();
  let invalidFrames = 0;
  page.on('websocket', socket => {
    if (new URL(socket.url()).host !== new URL(core.endpoint).host) return;
    socket.on('framereceived', frame => {
      try { kinds.add(core.contract.parseEvent(typeof frame.payload === 'string' ? frame.payload : frame.payload.toString('utf8')).kind); }
      catch { invalidFrames++; }
    });
  });
  await core.openDesktop(page, viteOrigin(), '#/chamber/visuals');
  await createVisualInUi(page, rehearsalVisual, 'SIMULATED rehearsal beacon');
  await page.goto(`${SHELL_ORIGIN}/#/rehearsal`);
  const workspace = page.getByRole('region', { name: 'Dress rehearsal', exact: true });
  await expect(workspace.locator('[data-stamp="simulated"]')).toHaveText('SIMULATED');
  const connection = workspace.getByRole('article', { name: 'Connect your OBS', exact: true });
  const password = connection.locator('input[name="password"]');
  await expect(password).toHaveAttribute('type', 'password');
  await expect(password).toHaveAttribute('autocomplete', 'off');
  await expect(connection.getByRole('checkbox', { name: 'Remember on this computer' })).not.toBeChecked();
  await core.connectObsInUi(page);
  await expect(password).toHaveValue('');
  await expect(connection.getByText('OBS connected', { exact: true }).first()).toBeVisible();
  const status = await core.invoke(core.contract.statusGet, {});
  expect(status).toMatchObject({ simulated: true, obs_connected: true, twitch_connected: false });
  await expect(page.locator('.cc-rampart [aria-label="OBS: connected"]')).toBeVisible();
  await expect(page.getByText('Core connection interrupted; status is unknown.', { exact: true })).toHaveCount(0);
  await auditStyles(page, desktopSurfaces); await auditFields(page);
  const scene = workspace.getByRole('article', { name: 'Rehearsal scene', exact: true });
  await scene.getByRole('button', { name: 'Set up rehearsal scene', exact: true }).click();
  await expect(scene.getByRole('status')).toHaveText('Rehearsal scene is ready.');
  await workspace.getByRole('button', { name: 'Fill a Lot', exact: true }).click();
  const draw = await eventually(async () => {
    const list = await core.invoke(core.contract.lotsDrawList, {});
    return list.draws.find(item => item.draw_id.startsWith('simulated-rehearsal-'));
  }, draw => Boolean(draw));
  if (!draw) throw new Error('Missing SIMULATED rehearsal draw');
  // Fill runs asynchronously. With crowd off, its twentieth generated viewer
  // proves the complete burst reached Lots before we freeze the roll.
  await eventually(() => core.invoke(core.contract.lotsRollLookup, { draw_id: draw.draw_id, user_id: '20' }), result => Boolean(result.entry));
  await workspace.getByRole('button', { name: 'Run a vote', exact: true }).click();
  await workspace.getByRole('button', { name: 'Run a duel round', exact: true }).click();
  await workspace.getByRole('combobox', { name: 'Beacon visual', exact: true }).selectOption(rehearsalVisual);
  await workspace.getByRole('button', { name: 'Fire beacon', exact: true }).click();

  // The existing Lots overlay discloses simulation only after an accepted seal.
  // Reuse the Lot Chamber's check + human hold; Fill a Lot itself never seals.
  await page.goto(`${SHELL_ORIGIN}/#/chamber/lottery`);
  const lots = page.getByRole('region', { name: 'Core Lot Chamber', exact: true });
  await lots.getByRole('combobox', { name: 'Draw', exact: true }).selectOption(draw.draw_id);
  await lots.getByRole('button', { name: 'Check giveaway guardrails', exact: true }).click();
  await holdToSeal(page, lots.getByRole('button', { name: 'Hold to seal', exact: true }),
    lots.getByText('Seal announced · entry list frozen before cast. Keep the announcement and OBS capture.', { exact: true }));
  // Rehearsal uses the real, verified public round, with the same chronology
  // gate as a live draw. Both lanes prove cast and durable writ, not just seal.
  const cast = lots.getByRole('button', { name: 'Cast the lots', exact: true });
  await expect(async () => {
    if (await cast.isEnabled()) await cast.click();
    await expect(lots.getByText(/^Winners · /)).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000, intervals: [3_000] });
  await expect(lots.locator('p.cc-status[role="status"]').last()).toHaveText('Proof bundle loaded from the core. Use an independent verifier to check it.');
  expect(invalidFrames, 'Invalid rehearsal control frames').toBe(0);
  for (const kind of ['rehearsal.status', 'lots.sealed', 'lots.cast']) {
    await expect.poll(() => kinds.has(kind), { message: `Missing ${kind} control invalidation` }).toBe(true);
  }
  // The native OBS probe is asynchronous; require observed reconnection rather
  // than sampling a transient disconnect once after the public-round wait.
  await expect.poll(async () => (await core.invoke(core.contract.statusGet, {})).obs_connected,
    { timeout: 30_000, message: 'Core did not observe OBS reconnection' }).toBe(true);
  await expect(page.locator('.cc-rampart [aria-label="OBS: connected"]')).toBeVisible();
  await expect(page.getByText('Core connection interrupted; status is unknown.', { exact: true })).toHaveCount(0);
  await page.goto(`${SHELL_ORIGIN}/#/rehearsal`);
  await expect(workspace.locator('[data-stamp="simulated"]')).toHaveText('SIMULATED');

  for (const row of ['Lot plate', 'Gatehouse vote bar', 'SIMULATED rehearsal beacon']) {
    const card = page.getByRole('article', { name: row, exact: true });
    await card.getByRole('combobox', { name: `${row} source size`, exact: true }).selectOption('720p');
    await expect(await addStreamOutput(page, row)).toHaveText('Added to the rehearsal scene. Inspect its placement in OBS.');
  }
  await auditStyles(page, desktopSurfaces); await auditFields(page);
  // Renew the test fire after the seal/UI checks so its temporary badge is live.
  await workspace.getByRole('button', { name: 'Fire beacon', exact: true }).click();
  const outputs = [
    { url: (await core.invoke(core.contract.lotsSourceUrl, { draw_id: draw.draw_id })).url,
      badge: '#draw[data-draw-mounted="true"] > .draw-scene > .simulated', content: '#draw .draw-winners li' },
    { url: (await core.invoke(core.contract.beaconsSourceUrl, { visual_id: rehearsalVisual })).url,
      badge: '[data-simulated-badge]', content: '#scene' },
    // gatehouseSourceUrl is exported from the contract's separate public door.
    { url: `${core.overlayOrigin}/gatehouse/current`, badge: '#vote-bar > p', content: '#vote-bar .vote-direction' },
  ];
  const browser = page.context().browser();
  if (!browser) throw new Error('Overlay verification requires the night browser');
  for (const output of outputs) {
    // The fixture guard owns context routes, so isolate it from the core UI.
    const overlay = await browser.newPage();
    const verify = await guardPage(overlay, core.overlayOrigin);
    try {
      await overlay.goto(output.url);
      // Lots hides its server fallback after mounting. Assert the foreground
      // badge beside the actual cast artwork, not the hidden fallback copy.
      const badge = overlay.locator(output.badge);
      await expect(badge).toHaveText('SIMULATED');
      await expect(badge).toBeVisible();
      await expect(overlay.locator(output.content).first()).toBeVisible();
      await overlay.goto('about:blank'); verify();
    } finally { await overlay.close(); }
  }
  await beforeClear?.();
  const cleanup = scene.getByRole('group', { name: 'Remove rehearsal sources', exact: true }).getByRole('button', { name: 'Hold to seal', exact: true });
  // A click cannot authorize source removal.
  await cleanup.click();
  await expect(scene.getByRole('status')).not.toHaveText(/^Removed /);
  await holdToSeal(page, cleanup, scene.getByRole('status').filter({ hasText: /^Removed [1-9]\d* rehearsal sources\.$/ }));
  const notice = await scene.getByRole('status').textContent();
  expect(Number(notice?.match(/\d+/)?.[0])).toBeGreaterThan(0);
}
