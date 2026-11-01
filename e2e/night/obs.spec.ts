import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildNightCore, startNightCore } from './launch.ts';
import type { NightCore, NightCoreOptions } from './launch.ts';
import { castQuestionsDrawInUi } from './lots-flow.ts';
import { ObsSocket, visibleShare } from './obs-ws.ts';
import { addStreamOutput, createVisualInUi, guardNight, nightOut, viteOrigin } from './support.ts';
import { dressRehearsalInUi, rehearsalScene, rehearsalSourceNames } from './rehearsal-flow.ts';
import { confirmObsCleanup, waitForObs } from './obs-ready.ts';

// OBS lane. Run only by scripts/night/obs.mjs, which launches a separate,
// isolated OBS (--multi, profile and collection CastleControl-Test, websocket
// on 4466 with a per-run password) and passes the port and password here in
// the environment. The e2e-night core reaches that OBS through its in-memory
// relay; this spec opens its own obs-websocket connection for screenshots.
const port = Number(process.env.CC_NIGHT_OBS_PORT);
const password = process.env.CC_NIGHT_OBS_PASSWORD ?? '';
const VISUAL = 'simulated-obs-beacon';
const SCENE = 'Scene';

const readyObs = () => waitForObs(timeout => ObsSocket.connect(port, password, timeout));

/** Wait before starting the relay; release both resources even if either test/cleanup fails. */
async function withObs(options: NightCoreOptions, run: (core: NightCore, obs: ObsSocket) => Promise<void>) {
  const obs = await readyObs();
  try {
    const core = await startNightCore(options);
    try { await run(core, obs); }
    finally { await core.close(); }
  } finally { obs.close(); }
}

async function clearRehearsal(core: NightCore) {
  // Reconnect independently: the screenshot socket may have died with OBS.
  const observer = await readyObs();
  try {
    await core.invoke(core.contract.obsRehearsalClear, {});
    const after = await confirmObsCleanup(observer, rehearsalScene, rehearsalSourceNames);
    // A pre-existing, unowned scene may legally survive the core's clear. In
    // this isolated lane, remove the empty test scene before the sibling test.
    if (after.scene_exists) {
      expect(after.scene_items).toEqual([]);
      await observer.request('RemoveScene', { sceneName: rehearsalScene });
      expect((await confirmObsCleanup(observer, rehearsalScene, rehearsalSourceNames)).scene_exists).toBe(false);
    }
  } finally { observer.close(); }
}

test.beforeAll(async () => {
  test.setTimeout(900_000);
  if (!Number.isInteger(port) || port === 4455 || !password) {
    throw new Error('obs.spec.ts runs only from scripts/night/obs.mjs with an isolated OBS');
  }
  await buildNightCore();
});

test('OBS: Dress rehearsal creates its own scene, renders SIMULATED overlays and removes owned inputs', async ({ page }) => {
  test.setTimeout(240_000);
  await withObs({ rehearsal: true, lotsBeacon: 'off', obs: { port, password } }, async (core, obs) => {
    try {
      const verify = await guardNight(page, core, ['lots.cast:conflict']);
      await dressRehearsalInUi(page, core, async () => {
        const folder = join(nightOut(), 'obs-rehearsal-screenshots');
        await mkdir(folder, { recursive: true });
        const inputs = await obs.request('GetSceneItemList', { sceneName: rehearsalScene });
        const names = Array.isArray(inputs.sceneItems) ? inputs.sceneItems.map(item => String(Object(item).sourceName)) : [];
        expect(names.sort()).toEqual([...rehearsalSourceNames].sort());
        for (const name of rehearsalSourceNames) {
          const file = join(folder, `${name.replace(/[^A-Za-z0-9]+/g, '-')}.png`);
          expect(await screenshot(obs, name, file), `${name} rendered nothing in isolated OBS`).toBeGreaterThan(0.002);
          await test.info().attach(name, { path: file, contentType: 'image/png' });
        }
      });
      // The UI hold returned removed > 0. Prove actual absence through our own
      // websocket, in both the scene list and global input inventory.
      await confirmObsCleanup(obs, rehearsalScene, rehearsalSourceNames);
      await page.goto('about:blank'); await verify();
    } finally {
      // Same isolated endpoint; use the persisted ownership ledger even on failure.
      await clearRehearsal(core);
    }
  });
});

async function screenshot(obs: ObsSocket, source: string, file: string): Promise<number> {
  // Browser sources need a moment to load in OBS's CEF; poll until something shows.
  const deadline = Date.now() + 45_000;
  let share = 0;
  while (Date.now() < deadline) {
    const bmp = await obs.request('GetSourceScreenshot', { sourceName: source, imageFormat: 'bmp', imageWidth: 480 });
    share = visibleShare(String(bmp.imageData));
    if (share > 0.002) break;
    await new Promise(resolve => setTimeout(resolve, 1_500));
  }
  const png = await obs.request('GetSourceScreenshot', { sourceName: source, imageFormat: 'png', imageWidth: 1280 });
  const data = String(png.imageData);
  await writeFile(file, Buffer.from(data.slice(data.indexOf(',') + 1), 'base64'));
  return share;
}

test('OBS: the UI adds Beacons and Gatehouse sources, Lots joins them, and each renders in a real OBS', async ({ page }) => {
  test.setTimeout(300_000);
  await withObs({ lotsBeacon: 'live', obs: { port, password } }, async (core, obs) => {
    const created: string[] = [];
    try {
      const verify = await guardNight(page, core, ['lots.cast:conflict']);
      // The real OBS has exactly the scene the night script created.
      const scenes = await obs.request('GetSceneList');
      expect(Array.isArray(scenes.scenes) ? scenes.scenes.map(scene => String(Object(scene).sceneName)) : []).toEqual([SCENE]);

      // Content for each page: a cast draw, a visual, and SIMULATED ballots.
      const handles = await castQuestionsDrawInUi(page, core);
      await page.goto('about:blank');
      await page.goto('http://tauri.localhost/#/chamber/visuals');
      await createVisualInUi(page, VISUAL, 'SIMULATED OBS beacon');
      core.chat('ballots', 6);

      await page.goto('about:blank');
      await page.goto('http://tauri.localhost/#/stream');
      const setup = page.getByRole('region', { name: 'On stream · Set up OBS', exact: true });
      await setup.getByRole('button', { name: 'Refresh OBS and outputs', exact: true }).click();
      await expect(setup.getByText('OBS is listening', { exact: true })).toBeVisible();
      await setup.getByRole('combobox', { name: 'Source size', exact: true }).selectOption('720p');
      await setup.getByRole('textbox', { name: 'Scene name', exact: true }).fill(SCENE);
      for (const row of ['Gatehouse vote bar', 'SIMULATED OBS beacon']) {
        const notice = await addStreamOutput(page, row);
        await expect(notice).toHaveText(`Added to OBS · ${SCENE} · 1280 × 720. Inspect the source in OBS.`);
        created.push(`Castle Control · ${row}`);
      }
      // #/stream offers no Lot plate row (it links to the Lot Chamber), so the
      // plate goes through the same obs.source.create method the UI uses.
      const lots = await core.invoke(core.contract.obsSourceCreate, { scene_name: SCENE,
        source_name: 'Castle Control · Lot plate', url: `${core.overlayOrigin}/lots/questions`, width: 1280, height: 720 });
      created.push(lots.source_name);

      const inputs = await obs.request('GetSceneItemList', { sceneName: SCENE });
      const names = Array.isArray(inputs.sceneItems) ? inputs.sceneItems.map(item => String(Object(item).sourceName)) : [];
      expect([...names].sort()).toEqual([...created].sort());

      const folder = join(nightOut(), 'obs-screenshots');
      await mkdir(folder, { recursive: true });
      const shares: Record<string, number> = {};
      for (const name of created) {
        const file = join(folder, `${name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')}.png`);
        shares[name] = await screenshot(obs, name, file);
        await test.info().attach(name, { path: file, contentType: 'image/png' });
      }
      console.log(`[obs lane] visible pixel share per source: ${JSON.stringify(shares)}`);
      for (const name of created) expect(shares[name], `${name} rendered nothing in OBS`).toBeGreaterThan(0.002);
      expect(handles).toHaveLength(2);
      await page.goto('about:blank');
      await verify();
    } finally {
      // Remove what this run added, even on failure; obs.mjs sweeps again before closing OBS.
      for (const name of created) await obs.request('RemoveInput', { inputName: name });
      await confirmObsCleanup(obs, SCENE, created);
    }
  });
});
