import { test, expect } from '@playwright/test';
import { SHELL_ORIGIN, buildNightCore, startNightCore } from './launch.ts';
import { guardNight, viteOrigin } from './support.ts';

// UI -> real core -> overlay. A visual is created and tuned in the Beacons room,
// its browser-source URL is copied from the UI, and a SIMULATED test fire in the
// UI must move the already-open overlay page through /push/beacons, without a reload.
const VISUAL = 'simulated-night-beacon';

test.beforeAll(async () => {
  test.setTimeout(900_000);
  await buildNightCore();
});

test('Beacons: create, tune and test-fire in the UI, then /beacons/{id} updates through the push stream', async ({ page, context }) => {
  const core = await startNightCore({ lotsBeacon: 'off' });
  try {
    const verify = await guardNight(page, core);
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: SHELL_ORIGIN });
    await core.openDesktop(page, viteOrigin(), '#/chamber/visuals');
    const room = page.getByRole('region', { name: 'Core Beacons', exact: true });
    // An empty core shows the Steward's way in; the full workbench lives behind More.
    await expect(room.getByRole('heading', { name: 'No beacon yet', exact: true })).toBeVisible();
    await room.locator('.visuals-more > summary').click();
    await room.getByRole('textbox', { name: 'Visual ID', exact: true }).fill(VISUAL);
    await room.getByRole('textbox', { name: 'Visual name', exact: true }).fill('SIMULATED night beacon');
    await room.getByRole('combobox', { name: 'Art style', exact: true }).selectOption({ label: 'Heraldic altar' });
    await room.getByRole('combobox', { name: 'Driven by', exact: true }).selectOption({ label: 'Bits cheer' });
    await room.getByRole('button', { name: 'Save visual to core', exact: true }).click();
    await expect(room.locator('.visuals-more').getByText('Visual configuration saved by the core.', { exact: true })).toBeVisible();

    // Tune: full intensity at 20 bits instead of 50.
    const curve = room.getByRole('form', { name: 'Kindling curve editor', exact: true });
    await curve.getByRole('group', { name: 'Control point 2', exact: true })
      .getByRole('spinbutton', { name: 'Contribution total', exact: true }).fill('20');
    await curve.getByRole('button', { name: 'Save curve to core', exact: true }).click();
    await expect(curve.getByText('Core-confirmed curve.', { exact: true })).toBeVisible();
    await expect.poll(async () => (await core.invoke(core.contract.beaconsVisualList, {}))
      .visuals.find(visual => visual.visual_id === VISUAL)?.curve.ranges.map(range => range.total)).toEqual([0, 20]);

    // The browser-source URL comes from the UI's own copy action.
    await room.getByRole('button', { name: 'Copy browser-source URL for SIMULATED night beacon', exact: true }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain(`/beacons/${VISUAL}`);
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    const source = new URL(copied);
    expect(source.origin).toBe(core.overlayOrigin);
    expect(source.pathname).toBe(`/beacons/${VISUAL}`);

    // Open the overlay first, then fire from the UI: the open page must update by push.
    const overlay = await context.newPage();
    await overlay.goto(copied);
    const scene = overlay.locator('#scene');
    await expect(scene.locator('img')).toHaveCount(1);
    await expect(scene).toHaveAttribute('data-intensity', '0');
    await expect(scene).toHaveAttribute('data-simulated', 'false');

    const fire = room.getByRole('region', { name: 'Test fire', exact: true });
    await fire.getByRole('combobox', { name: 'Input source', exact: true }).selectOption({ label: 'Bits cheer' });
    await fire.getByRole('spinbutton', { name: 'Amount (source units)', exact: true }).fill('10');
    await fire.getByRole('button', { name: 'Simulate burst', exact: true }).click();
    await expect(room.getByRole('table', { name: 'Simulated Beacons contribution events', exact: true })
      .getByRole('row')).not.toHaveCount(0);

    // 10 bits on a 0..20 curve: half intensity, marked as a simulation.
    await expect(scene).toHaveAttribute('data-intensity', '0.5');
    await expect(scene).toHaveAttribute('data-simulated', 'true');
    await expect(overlay.locator('[data-simulated-badge]')).toBeVisible();
    await overlay.close();
    await page.goto('about:blank');
    await verify();
  } finally { await core.close(); }
});
