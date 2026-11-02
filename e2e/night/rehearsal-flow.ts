// Generated SIMULATED scenarios only. Shared by the fake-peer and isolated OBS lanes.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { NightCore } from './launch.ts';
import { SHELL_ORIGIN } from './launch.ts';
import { addStreamOutput, createVisualInUi, eventually, holdToSeal, viteOrigin } from './support.ts';
import { auditFields, auditStyles, desktopSurfaces } from '../styles.ts';
import { guardPage } from '../network.ts';

export const rehearsalVisual = 'simulated-rehearsal-beacon';
export const rehearsalScene = 'Castle Control · Rehearsal';
export const rehearsalSourceNames = ['Castle Control · Lot plate', 'Castle Control · Gatehouse vote bar', 'Castle Control · SIMULATED rehearsal beacon', 'Castle Control · Duel'];

async function assertRehearsalVote(page: Page, core: NightCore) {
  const browser = page.context().browser();
  if (!browser) throw new Error('Overlay verification requires the night browser');
  const overlay = await browser.newPage();
  const verify = await guardPage(overlay, core.overlayOrigin);
  try {
    await overlay.goto(`${core.overlayOrigin}/gatehouse/current`);
    const bar = overlay.getByRole('main', { name: 'Consensus vote bar', exact: true });
    await expect(bar.locator(':scope > p')).toHaveText('SIMULATED');
    await expect(bar.locator(':scope > p')).toBeVisible();
    const rows = bar.locator('.vote-direction');
    await expect(rows).toHaveCount(3);
    for (const row of await rows.all()) await expect(row).toBeVisible();
    await expect(bar.locator('.vote-direction > span')).toHaveText([
      /^Direction 1 · [1-9]\d?%$/,
      /^Direction 2 · [1-9]\d?%$/,
      /^Direction 3 · [1-9]\d?%$/,
    ]);
    await overlay.goto('about:blank'); verify();
  } finally { await overlay.close(); }
}

async function assertRehearsalDuel(page: Page, core: NightCore) {
  const browser = page.context().browser();
  if (!browser) throw new Error('Overlay verification requires the night browser');
  const overlay = await browser.newPage();
  const verify = await guardPage(overlay, core.overlayOrigin);
  try {
    await overlay.goto(`${core.overlayOrigin}/tiltyard/current`);
    const duel = overlay.getByRole('main', { name: 'Tiltyard duel', exact: true });
    await expect(duel.locator('.simulated')).toHaveText('SIMULATED');
    await expect(duel.locator('.simulated')).toBeVisible();
    await expect(duel.locator('.tiltyard-side')).toHaveCount(2);
    await expect(duel.locator('.tiltyard-side').first()).toContainText('Sample: Castle');
    await expect(duel.locator('.tiltyard-side').last()).toContainText('Sample: Sky');
    await overlay.goto('about:blank'); verify();
  } catch (error) {
    // This separate overlay context is outside the test's automatic screenshot.
    await test.info().attach('tiltyard-failure', { body: await overlay.screenshot(), contentType: 'image/png' });
    throw error;
  } finally { await overlay.close(); }
}

/** The rehearsal's Steward flows, driven the way a streamer drives them: chip, option cards, one hold. */
function rehearsalSteward(page: Page) {
  const dock = page.locator('.cc-steward-dock[data-chamber="rehearsal"]');
  const sheet = dock.getByRole('group', { name: 'Steward conversation', exact: true });
  const chips = dock.getByRole('group', { name: 'Steward suggestions', exact: true });
  const step = (id?: string) => sheet.locator(id ? `.cc-steward-step[data-step="${id}"]` : '.cc-steward-step');
  const pattern = (label: string) => new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  return {
    sheet, step,
    async open(flow: string) {
      const chip = chips.getByRole('button', { name: flow, exact: true });
      if (await chip.count()) await chip.click();
      else {
        await chips.getByRole('button', { name: 'More flows' }).click();
        await page.getByRole('menu', { name: 'Every Steward flow in this chamber', exact: true })
          .getByRole('menuitem', { name: pattern(flow) }).click();
      }
      await expect(sheet).toBeVisible();
    },
    /** Pick an option card by its leading label. */
    async pick(label: string) {
      await step().getByRole('button', { name: pattern(label) }).first().click();
    },
    async field(value: string) {
      await step().locator('input').fill(value);
      await step().getByRole('button', { name: 'Continue', exact: true }).click();
    },
    /** Hold the confirm card's seal until one more Steward line matching `said` appears, then release. */
    async hold(said: string | RegExp) {
      const line = sheet.locator('.cc-steward-thread').getByText(said);
      const before = await line.count();
      const seal = step('seal').getByRole('button', { name: 'Hold to seal', exact: true });
      await expect(seal).toBeEnabled();
      await seal.focus();
      await page.keyboard.down('Space');
      try { await expect(line).toHaveCount(before + 1, { timeout: 30_000 }); }
      finally { await page.keyboard.up('Space'); }
      // Lower the sheet so the page's own controls are reachable again.
      await sheet.getByRole('button', { name: /^Lower/ }).click();
      await expect(sheet).toBeHidden();
    },
  };
}

/** Leave a populated scene for optional OBS screenshots, then remove through the UI hold. */
export async function dressRehearsalInUi(page: Page, core: NightCore, beforeClear?: (lot_url: string) => Promise<void>) {
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
  // The page detects the rehearsal core (rehearsal.start answers) and shows the in-rehearsal workspace.
  await expect(workspace.locator('[data-stamp="simulated"]')).toHaveText('SIMULATED');
  await expect(workspace.getByRole('button', { name: 'Leave dress rehearsal', exact: true })).toBeVisible();
  const board = workspace.getByRole('region', { name: 'Rehearsal status', exact: true });
  await expect(board.getByRole('heading', { name: 'The rehearsal, step by step', exact: true })).toBeVisible();
  await expect(board.locator('[data-station="session"] .rh-station__value')).toHaveText('Active');
  const connection = workspace.getByRole('region', { name: 'Connect your OBS', exact: true });
  const password = connection.locator('input[name="password"]');
  await expect(password).toHaveAttribute('type', 'password');
  await expect(password).toHaveAttribute('autocomplete', 'off');
  await expect(connection.getByRole('checkbox', { name: 'Remember on this computer' })).not.toBeChecked();
  // Connect my OBS through the Steward: the page's one masked field moves into the hold card.
  const steward = rehearsalSteward(page);
  await steward.open('Connect my OBS');
  await steward.pick('On this computer');
  await steward.pick('A different port');
  await steward.field(String(core.obsPort));
  await steward.pick('OBS asks for a password');
  await steward.pick('Just this time');
  const held = steward.step('seal').locator('input[name="password"]');
  await expect(held).toHaveAttribute('type', 'password');
  await expect(held).toHaveAttribute('autocomplete', 'off');
  await expect(page.locator('input[name="password"]')).toHaveCount(1);
  await core.typeObsPasswordInUi(page);
  await steward.hold(`OBS is connected at 127.0.0.1:${core.obsPort}.`);
  // The hold read the field once and cleared it; it is back home in the page form, empty.
  await expect(password).toHaveValue('');
  await expect(connection.getByText('OBS connected', { exact: true }).first()).toBeVisible();
  await expect(board.locator('[data-station="obs"] .rh-station__value')).toHaveText('Connected');
  // The page form stays the direct path for the same connection.
  await core.connectObsInUi(page);
  await expect(password).toHaveValue('');
  await expect(connection.getByRole('status')).toHaveText('OBS connected');
  const status = await core.invoke(core.contract.statusGet, {});
  expect(status).toMatchObject({ simulated: true, obs_connected: true, twitch_connected: false });
  await expect(page.locator('.cc-rampart [aria-label="OBS: connected"]')).toBeVisible();
  await expect(page.getByText('Core connection interrupted; status is unknown.', { exact: true })).toHaveCount(0);
  await auditStyles(page, desktopSurfaces); await auditFields(page);
  const scene = workspace.getByRole('region', { name: 'Rehearsal scene', exact: true });
  await scene.getByRole('button', { name: 'Set up rehearsal scene', exact: true }).click();
  await expect(scene.getByRole('status')).toHaveText('Rehearsal scene is ready.');
  // Check the vote before Lots/duel chat can add the valid Other direction.
  await steward.open('Run a scenario');
  await steward.pick('Run a vote');
  await steward.hold('SIMULATED scenario accepted.');
  await eventually(() => core.invoke(core.contract.gatehouseConsensusGet, { window_s: 900, filter: { kind: 'all' } }),
    result => result.directions.length === 3 && result.directions.every(direction => direction.share > 0)
      && result.directions.reduce((total, direction) => total + direction.messages, 0) === 30);
  await assertRehearsalVote(page, core);
  await workspace.getByRole('button', { name: 'Fill a Lot', exact: true }).click();
  const draw = await eventually(async () => {
    const list = await core.invoke(core.contract.lotsDrawList, {});
    return list.draws.find(item => item.draw_id.startsWith('simulated-rehearsal-'));
  }, draw => Boolean(draw));
  if (!draw) throw new Error('Missing SIMULATED rehearsal draw');
  // With crowd off, the 30 vote viewers precede the 20 Lot viewers. Viewer 50
  // proves the complete Fill burst reached Lots before we freeze the roll.
  await eventually(() => core.invoke(core.contract.lotsRollLookup, { draw_id: draw.draw_id, user_id: '50' }), result => Boolean(result.entry));
  await workspace.getByRole('button', { name: 'Run a duel round', exact: true }).click();
  await eventually(() => core.invoke(core.contract.maproomStageGet, {}), result => Boolean(result.session?.simulated
    && result.session.counted.left + result.session.counted.right > 0));
  await assertRehearsalDuel(page, core);
  await steward.open('Run a scenario');
  await steward.pick('Fire a beacon');
  await steward.pick('SIMULATED rehearsal beacon');
  await steward.hold('SIMULATED scenario accepted.');
  await expect(workspace.getByRole('combobox', { name: 'Beacon visual', exact: true })).toHaveValue(rehearsalVisual);

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
  for (const kind of ['rehearsal.status', 'lots.sealed', 'lots.cast', 'maproom.turn']) {
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

  // The Lot plate through its row's own hold, the rest through the Steward's scene flow.
  await page.getByRole('article', { name: 'Lot plate', exact: true })
    .getByRole('combobox', { name: 'Lot plate source size', exact: true }).selectOption('720p');
  await expect(await addStreamOutput(page, 'Lot plate')).toHaveText('Added to the rehearsal scene. Inspect its placement in OBS.');
  await steward.open('Set up the scene');
  await steward.pick('Use the rehearsal scene');
  await steward.pick('Everything available');
  await steward.pick('720p');
  await expect(steward.step('seal')).toContainText('Gatehouse vote bar, SIMULATED rehearsal beacon, Duel');
  await steward.hold('Added 3 sources to Castle Control · Rehearsal. Inspect their placement in OBS.');
  for (const row of ['Lot plate', 'Gatehouse vote bar', 'SIMULATED rehearsal beacon', 'Duel']) {
    const card = page.getByRole('article', { name: row, exact: true });
    await expect(card.getByRole('combobox', { name: `${row} source size`, exact: true })).toHaveValue('720p');
    await expect(card.getByRole('status').first()).toHaveText('Added to the rehearsal scene. Inspect its placement in OBS.');
  }
  await auditStyles(page, desktopSurfaces); await auditFields(page);
  // Renew the test fire after the seal/UI checks so its temporary badge is live.
  await workspace.getByRole('button', { name: 'Fire beacon', exact: true }).click();
  await workspace.getByRole('button', { name: 'Run a duel round', exact: true }).click();
  await eventually(() => core.invoke(core.contract.maproomStageGet, {}), result => Boolean(result.session?.simulated
    && result.session.counted.left + result.session.counted.right > 0));
  const lot_url = (await core.invoke(core.contract.lotsSourceUrl, { draw_id: draw.draw_id })).url;
  expect(new URL(lot_url).pathname).toBe(`/lots/${draw.draw_id}`);
  expect(new URL(lot_url).search).toBe('');
  const outputs = [
    { url: lot_url,
      badge: '#draw[data-draw-mounted="true"] > .draw-scene > .simulated', content: '#draw .draw-winners li' },
    { url: (await core.invoke(core.contract.beaconsSourceUrl, { visual_id: rehearsalVisual })).url,
      badge: '[data-simulated-badge]', content: '#scene' },
    { url: (await core.invoke(core.contract.tiltyardSourceUrl, {})).url,
      badge: '#tiltyard > .simulated', content: '#tiltyard .tiltyard-side' },
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
  // The callback receives the exact URL whose cast and visible SIMULATED badge
  // were just checked, after the UI seal, verified cast and durable writ.
  await beforeClear?.(lot_url);
  const cleanup = scene.getByRole('group', { name: 'Remove rehearsal sources', exact: true }).getByRole('button', { name: 'Hold to seal', exact: true });
  // A click cannot authorize source removal.
  await cleanup.click();
  await expect(scene.getByText(/^Removed /)).toHaveCount(0);
  // The Steward's Clean up flow is the hold that removes them.
  await steward.open('Clean up');
  await steward.pick('Remove rehearsal sources');
  await steward.hold(/^Removed [1-9]\d* rehearsal sources\.$/);
  await expect(scene.getByRole('status')).toHaveText(/^Removed [1-9]\d* rehearsal sources\.$/);
  const notice = await scene.getByRole('status').textContent();
  expect(Number(notice?.match(/\d+/)?.[0])).toBeGreaterThan(0);
  // The page's own hold stays the direct path; with nothing left it removes none.
  await holdToSeal(page, cleanup, scene.getByRole('status').filter({ hasText: /^Removed 0 rehearsal sources\.$/ }));
}
