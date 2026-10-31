import { test, expect } from '@playwright/test';
import { buildNightCore, startNightCore } from './launch.ts';
import { addStreamOutput, createVisualInUi, guardNight, viteOrigin } from './support.ts';

// #/stream OBS setup -> obs.source.create -> the core's real cc-obs client ->
// the authenticating relay -> the generated fake OBS peer (it has one scene,
// "Scene"). The relay reports each CreateInput, so the test sees exactly what
// OBS received. A wrong scene must be refused by OBS and shown as refused.
const VISUAL = 'simulated-stream-beacon';

test.beforeAll(async () => {
  test.setTimeout(900_000);
  await buildNightCore();
});

test('#/stream: hold to add the vote bar and a Beacons visual as OBS browser sources', async ({ page }) => {
  const core = await startNightCore({ lotsBeacon: 'off' });
  try {
    const verify = await guardNight(page, core, ['obs.source.create:unavailable']);
    await core.openDesktop(page, viteOrigin(), '#/chamber/visuals');
    await createVisualInUi(page, VISUAL, 'SIMULATED stream beacon');

    await page.goto('about:blank');
    await page.goto('http://tauri.localhost/#/stream');
    const setup = page.getByRole('region', { name: 'On stream · Set up OBS', exact: true });
    await setup.getByRole('button', { name: 'Refresh OBS and outputs', exact: true }).click();
    await expect(setup.getByText('OBS is listening', { exact: true })).toBeVisible();
    await expect(setup.getByRole('article', { name: 'SIMULATED stream beacon', exact: true })).toBeVisible();
    await setup.getByRole('combobox', { name: 'Source size', exact: true }).selectOption('720p');

    // A scene OBS does not have: OBS refuses, the row says so, nothing is created.
    await setup.getByRole('textbox', { name: 'Scene name', exact: true }).fill('SIMULATED missing scene');
    const refused = await addStreamOutput(page, 'Gatehouse vote bar');
    await expect(refused).toHaveText('OBS is not connected or refused the source; check that the scene exists.');

    await setup.getByRole('textbox', { name: 'Scene name', exact: true }).fill('Scene');
    for (const row of ['Gatehouse vote bar', 'SIMULATED stream beacon']) {
      const notice = await addStreamOutput(page, row);
      await expect(notice).toHaveText('Added to OBS · Scene · 1280 × 720. Inspect the source in OBS.');
    }

    const requests = core.obsReports().filter(report => report.request === 'CreateInput');
    const responses = core.obsReports().filter(report => report.response === 'CreateInput');
    expect(requests.map(report => [report.scene, report.input])).toEqual([
      ['SIMULATED missing scene', 'Castle Control · Gatehouse vote bar'],
      ['Scene', 'Castle Control · Gatehouse vote bar'],
      ['Scene', 'Castle Control · SIMULATED stream beacon'],
    ]);
    expect(responses.map(report => [report.result, report.code])).toEqual([[false, 600], [true, 100], [true, 100]]);
    expect(new URL(requests[1]?.url ?? '').href).toBe(`${core.overlayOrigin}/gatehouse/current`);
    const beacon = new URL(requests[2]?.url ?? '');
    expect(beacon.origin).toBe(core.overlayOrigin);
    expect(beacon.pathname).toBe(`/beacons/${VISUAL}`);

    // Each URL OBS received is the overlay page it will load; load it here too.
    await page.goto(requests[2]?.url ?? 'about:blank');
    await expect(page.locator('#scene img')).toHaveCount(1);
    await page.goto(requests[1]?.url ?? 'about:blank');
    await expect(page.getByRole('main', { name: 'Consensus vote bar', exact: true })).toBeVisible();
    await page.goto('about:blank');
    await verify();
  } finally { await core.close(); }
});
