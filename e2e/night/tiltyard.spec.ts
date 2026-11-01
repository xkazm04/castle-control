import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { SHELL_ORIGIN, buildNightCore, startNightCore } from './launch.ts';
import { guardNight, viteOrigin } from './support.ts';

test.beforeAll(async () => { test.setTimeout(900_000); await buildNightCore(); });

test('Tiltyard: desktop starts a core tournament, generated ballots reach both pictures, and a streamer call overrides the tally', async ({ page, context }) => {
  const core = await startNightCore({ lotsBeacon: 'off' });
  let overlay: Page | undefined;
  try {
    const verify = await guardNight(page, core);
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: SHELL_ORIGIN });
    await core.openDesktop(page, viteOrigin(), '#/chamber/studio');
    const stage = page.getByRole('dialog', { name: 'The Tiltyard, duel stage', exact: true });
    await expect(stage.getByRole('button', { name: 'Start tournament', exact: true })).toBeEnabled();

    // Resolve the actual source affordance before opening the vote window.
    await page.getByRole('button', { name: 'Duel on stream · Copy browser source URL', exact: true }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('/tiltyard/current');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe(`${core.overlayOrigin}/tiltyard/current`);
    overlay = await context.newPage();
    await overlay.goto(copied);
    const source = overlay.getByRole('main', { name: 'Tiltyard duel', exact: true });
    await expect(source).toContainText('Waiting for a tournament');

    await stage.getByRole('button', { name: 'Start tournament', exact: true }).click();
    const chat = stage.locator('[data-role="ty-core-chat"]');
    await expect(chat).toHaveAttribute('data-phase', 'live');
    await expect(chat.locator('[data-role="ty-card-title"]')).toHaveText(['Raze the mill', 'Borrow the mill']);
    await expect(source.locator('.tiltyard-side')).toHaveText(['1 · Raze the mill · 0', '2 · Borrow the mill · 0']);

    // Night driver feeds generated SIMULATED messages through real shadow moderation.
    // No RPC in this test supplies ballot counts, timestamps or a chosen champion.
    // Two bursts prove that an already-mounted live stage keeps refreshing.
    // Read phase and both counts together so a transition cannot mix pictures.
    const liveCounts = async () => chat.evaluate(element => ({
      phase: element.getAttribute('data-phase'),
      counts: ['left', 'right'].map(side => element.querySelector(`[data-role="ty-core-${side}-count"]`)?.textContent),
    }));
    for (const [burst, left, right] of [[3, 2, 1], [6, 6, 3]] as const) {
      core.chat('ballots', burst);
      await Promise.all([
        expect.poll(liveCounts).toEqual({ phase: 'live', counts: [String(left), String(right)] }),
        expect(source.locator('.tiltyard-side')).toHaveText([`1 · Raze the mill · ${left}`, `2 · Borrow the mill · ${right}`]),
      ]);
    }
    await expect(source.locator('.simulated')).toHaveText('SIMULATED');
    await expect(chat.locator('[data-role="ty-round"]')).toHaveText('Semifinal');
    await expect(chat.locator('[data-role="ty-core-match-label"]')).toHaveText('Match 1');
    await expect(source).toContainText('Semifinal · Match 1 · Open');

    // Assert both pictures inside the core's call theatre, before it opens the next pair.
    const response = page.waitForResponse(response => {
      if (response.url() !== `${core.endpoint}rpc`) return false;
      const body: unknown = response.request().postDataJSON();
      if (!body || typeof body !== 'object' || !('method' in body) || body.method !== 'maproom.turn.run' || !('params' in body)) return false;
      return core.contract.parseMethodParams(core.contract.maproomTurnRun, body.params).action.kind === 'pick';
    });
    await chat.locator('[data-role="ty-card"][data-side="1"]').click();
    const result = core.contract.parseMethodResult(core.contract.maproomTurnRun, await (await response).text());
    expect(result.session).toMatchObject({ phase: 'verdict', counted: { left: 6, right: 3 }, simulated: true,
      verdict: { a: 'raze-the-mill', b: 'borrow-the-mill', verdict: { side: 'right', how: 'call' }, counted: { left: 6, right: 3 } } });
    await Promise.all([
      expect(chat).toHaveAttribute('data-match-key', result.session?.verdict?.match_key ?? 'missing'),
      expect(chat.locator('[data-role="ty-core-verdict"]')).toHaveText('Your call: Borrow the mill'),
      expect(chat.locator('[data-role="ty-core-verdict"]')).toHaveAttribute('data-side', 'right'),
      expect(chat.locator('[data-role="ty-core-verdict"]')).toHaveAttribute('data-how', 'call'),
      expect(source).toContainText('Winner: Borrow the mill · call'),
      expect(source.locator('.tiltyard-side')).toHaveText(['1 · Raze the mill · 6', '2 · Borrow the mill · 3']),
      expect(chat.locator('[data-role="ty-core-left-count"]')).toHaveText('6'),
      expect(chat.locator('[data-role="ty-core-right-count"]')).toHaveText('3'),
      expect(source).toContainText('Semifinal · Match 1 · Called'),
    ]);

    // Leave and return: the desktop must read the existing core bracket, never restart a React session.
    await page.goto(`${SHELL_ORIGIN}/#/keep`);
    await page.goto(`${SHELL_ORIGIN}/#/chamber/studio`);
    await expect(stage.locator('[data-role="ty-core-chat"]')).toBeVisible();
    // The native 3000 ms call theatre advances the pair even across remounts.
    await expect(stage.locator('[data-role="ty-core-chat"]')).toHaveAttribute('data-phase', 'live');
    await Promise.all([
      expect(stage.locator('[data-role="ty-core-match-label"]')).toHaveText('Match 2'),
      expect(stage.locator('[data-role="ty-card-title"]')).toHaveText(['Tax the miller', 'Spare it']),
      expect(stage.locator('[data-role="ty-core-left-count"]')).toHaveText('0'),
      expect(stage.locator('[data-role="ty-core-right-count"]')).toHaveText('0'),
      expect(source).toContainText('Semifinal · Match 2 · Open'),
      expect(source.locator('.tiltyard-side')).toHaveText(['1 · Tax the miller · 0', '2 · Spare it · 0']),
    ]);
    const current = await core.invoke(core.contract.maproomStageGet, {});
    expect(current.session?.history).toHaveLength(1);
    expect(current.session?.calls[0]).toMatchObject({ winner: 'borrow-the-mill', counted: { left: 6, right: 3 } });
    await overlay.close(); await page.goto('about:blank'); await verify();
  } catch (error: unknown) {
    // Playwright's automatic screenshots run after finally/close. Preserve the
    // actual failure picture before teardown can disconnect both renderers.
    for (const [name, picture] of [['desktop', page], ['overlay', overlay]] as const) {
      if (picture && !picture.isClosed()) await test.info().attach(`tiltyard-${name}-before-core-close`, {
        body: await picture.screenshot(), contentType: 'image/png',
      });
    }
    throw error;
  } finally { await core.close(); }
});
