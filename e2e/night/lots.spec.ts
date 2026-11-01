import { test, expect } from '@playwright/test';
import { buildNightCore, startNightCore } from './launch.ts';
import { guardNight } from './support.ts';
import { castQuestionsDrawInUi } from './lots-flow.ts';

// UI -> real core -> overlay. Entrants are generated SIMULATED chat sent through
// the core's post-bridge seam. The seal targets the public drand quicknet (the
// product's own live opt-in, inside the run's temporary data root), so the cast
// waits for a real round. No Twitch connection exists in this core.
test.beforeAll(async () => {
  test.setTimeout(900_000); // A cold Cargo build may run first.
  await buildNightCore();
});

test('Lots: configure, seal and cast in the UI, then /lots/{id} shows the core winners', async ({ page }) => {
  const core = await startNightCore({ lotsBeacon: 'live' });
  try {
    const verify = await guardNight(page, core, ['lots.cast:conflict']);
    const handles = await castQuestionsDrawInUi(page, core);

    // The overlay page the cast caused, in the browser.
    await page.goto(`${core.overlayOrigin}/lots/questions`);
    await expect(page.locator('[data-draw-winner]')).toHaveText(handles);
    const island = await page.locator('#cc-cast').textContent();
    if (!island) throw new Error('Missing the accepted cast on the overlay page');
    expect(core.contract.parseMethodResult(core.contract.lotsCast, island).cast.winners).toEqual(handles);
    await page.goto('about:blank');
    await verify();
  } finally { await core.close(); }
});
