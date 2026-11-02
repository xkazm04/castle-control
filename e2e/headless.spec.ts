import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { access, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { repo } from './inventory.ts';
import { guardPage } from './network.ts';
import { guardHeadless, openHeadlessDesktop, SHELL_ORIGIN } from './headless/shell.ts';
import { CAPABILITY, CC, field, headlessRoots, line, mcpClient, runNode } from './headless/process.ts';

// Loaded by URL, the e2e lane's pattern for workspace sources (see night/launch.ts).
type Contract = typeof import('../packages/contract/src/index.ts');
type Headless = typeof import('../packages/headless/src/index.ts');
type Session = import('../packages/headless/src/index.ts').Session;
const contract: Contract = await import(new URL('../packages/contract/src/index.ts', import.meta.url).href);
const { ARMED, buildLauncher, startCore, TOOLS }: Headless =
  await import(new URL('../packages/headless/src/index.ts', import.meta.url).href);

// One-time lane (e2e/headless.config.ts). The default e2e config also matches
// *.spec.ts; without the headless lane's metadata nothing here starts a core.
const VISUAL = 'simulated-headless-beacon';
const SHOTS = join(repo, 'e2e', 'screenshots');
const CONSENSUS = { window_s: 900, filter: { kind: 'all' } };

let exe = '';
let session: Session | undefined;
let root = '';
const before = new Set<string>();

function live(): Session {
  if (!session) throw new Error('No headless session');
  return session;
}

/** Call a tool through the session and require an ok outcome. */
async function ok(tool: string, args: unknown = {}): Promise<unknown> {
  const outcome = await live().call(tool, args);
  if (!outcome.ok) throw new Error(`${tool} refused: ${outcome.error.code} ${outcome.error.message}`);
  return outcome.result;
}

/** Typed view of a session result through the contract's own result parser. */
async function read<M extends keyof import('../packages/contract/src/index.ts').RpcMethods>(method: M, args: unknown = {}) {
  return contract.parseResult(method, JSON.stringify(await ok(method, args)));
}

async function until<T>(probe: () => Promise<T>, accept: (value: T) => boolean, timeout = 20_000): Promise<T> {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await probe();
    if (accept(value)) return value;
    if (Date.now() > deadline) throw new Error('Timed out waiting for the headless core');
    await new Promise(resolve => setTimeout(resolve, 250));
  }
}

async function shot(page: Page, name: string): Promise<void> {
  const path = join(SHOTS, `headless-${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: 'disabled', caret: 'hide' });
  console.log(`[headless] screenshot ${path}`);
}

function viteOrigin(): string {
  const vite = test.info().config.metadata.vite;
  if (typeof vite !== 'string') throw new Error('headless.config.ts must expose the Vite origin');
  return vite;
}

test.describe.serial('headless layer, one time', () => {
  test.beforeAll(async () => {
    test.skip(test.info().config.metadata.lane !== 'headless', 'Runs only under e2e/headless.config.ts (pnpm e2e:headless)');
    test.setTimeout(900_000);
    await mkdir(SHOTS, { recursive: true });
    exe = process.env.CC_HEADLESS_EXE ?? await buildLauncher(text => { process.stderr.write(text); });
    for (const name of await headlessRoots()) before.add(name);
    session = await startCore({ exe });
    const created = [...await headlessRoots()].filter(name => !before.has(name));
    expect(created, 'startCore made exactly one isolated temp root').toHaveLength(1);
    root = created[0] ?? '';
  });

  test.afterAll(async () => { await session?.close(); });

  test('1 library: rehearsal tools drive Gatehouse, Lots and the event stream', async () => {
    expect(TOOLS.length).toBe(27);
    const started = await read('rehearsal.start');
    expect(started).toMatchObject({ active: true, obs: { connected: false } });
    const crowd = await read('rehearsal.crowd.set', { per_minute: 120 });
    expect(crowd.crowd_per_minute).toBe(120);
    expect(await read('rehearsal.scenario.run', { scenario: 'vote_round' })).toEqual({ accepted: true });
    // lots_fill needs no network: drand is reached only on seal/cast, which are denied here.
    expect(await read('rehearsal.scenario.run', { scenario: 'lots_fill' })).toEqual({ accepted: true });

    const consensus = await until(() => read('gatehouse.consensus.get', CONSENSUS), result =>
      ['sample_castle', 'sample_forest', 'sample_sea'].every(key =>
        result.directions.some(direction => direction.key === key && direction.messages > 0)));
    const sampled = consensus.directions.filter(direction => direction.key.startsWith('sample_'));
    console.log(`[headless] consensus ${consensus.directions.map(d => `${d.key}=${d.messages}`).join(' ')}`);
    expect(sampled.map(direction => direction.label).sort()).toEqual(['Sample: Castle', 'Sample: Forest', 'Sample: Sea']);

    const draws = await read('lots.draw.list');
    const draw = draws.draws.find(item => item.draw_id.startsWith('simulated-rehearsal-'));
    expect(draw?.name).toBe('SIMULATED rehearsal questions');
    if (!draw) throw new Error('Missing SIMULATED rehearsal draw');
    // The SIMULATED !join burst reaches the roll: lots.roll events arrive on the stream.
    await until(() => live().eventsSince(0), result => result.events.some(event => event.kind === 'lots.roll'));

    const bar = await ok('overlay_snapshot', { kind: 'gatehouse' });
    expect(field(bar, 'simulated')).toBe(true);
    const directions = field(field(bar, 'snapshot'), 'directions');
    expect(Array.isArray(directions) && directions.length >= 3).toBe(true);

    const status = await read('status.get');
    expect(status).toMatchObject({ simulated: true, twitch_connected: false, obs_connected: false });

    const { events } = await live().eventsSince(0);
    const kinds = new Set<string>(events.map(event => event.kind));
    console.log(`[headless] event kinds ${[...kinds].sort().join(', ')}`);
    for (const kind of ['rehearsal.status', 'gatehouse.consensus', 'gatehouse.decision', 'lots.roll']) {
      expect(kinds.has(kind), `events.since carries ${kind}`).toBe(true);
    }
  });

  test('2 ui: the desktop UI on the same core shows what headless produced', async ({ page, browser }) => {
    const handoff = live().uiHandoff();
    const coreOrigin = new URL(handoff.endpoint).origin;
    const verify = await guardHeadless(page, coreOrigin, handoff.overlay_origin);
    const methods = await openHeadlessDesktop(page, viteOrigin(), handoff, '#/rehearsal');

    // Rehearsal: the page finds the SIMULATED rehearsal that headless started, at its crowd rate.
    const workspace = page.getByRole('region', { name: 'Dress rehearsal', exact: true });
    await expect(workspace.locator('[data-stamp="simulated"]').first()).toHaveText('SIMULATED');
    const board = workspace.getByRole('region', { name: 'Rehearsal status', exact: true });
    await expect(board.locator('[data-station="session"] .rh-station__value')).toHaveText('Active');
    await expect(board.locator('[data-station="crowd"] .rh-station__value')).toHaveText('120');
    await expect(board.locator('[data-station="obs"] .rh-station__value')).toHaveText('Not connected');
    await expect(page.getByText('Core connection interrupted; status is unknown.', { exact: true })).toHaveCount(0);
    await shot(page, 'rehearsal');

    // Gatehouse: the vote_round ballots, labelled SIMULATED, and the Herald's sample directions.
    await page.goto(`${SHELL_ORIGIN}/#/chamber/moderator`);
    // The Deck status bar: the Gatehouse chip links to this room and carries the simulated state.
    const chip = page.getByRole('banner').getByRole('link', { name: 'Gatehouse simulated', exact: true });
    await expect(chip).toHaveAttribute('href', '#/chamber/moderator');
    await expect(chip.getByRole('img', { name: 'Gatehouse simulated', exact: true })).toBeVisible();
    // The room's own Herald section shows the three sample directions with their shares.
    const herald = page.getByRole('group', { name: 'Room sections 2', exact: true })
      .getByRole('region', { name: 'The Herald’s chart', exact: true });
    for (const label of ['Sample: Castle', 'Sample: Forest', 'Sample: Sea']) {
      await expect(herald).toContainText(new RegExp(String.raw`${label}\s*\d+\.\d%`));
    }
    // The chat table now lives in the "more of the Gatehouse" drawer.
    await page.getByRole('button', { name: 'Live room · more of the Gatehouse', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: 'The Herald and more of the Gatehouse', exact: true });
    const rows = drawer.getByRole('table', { name: 'Core chat messages', exact: true }).getByRole('row');
    await expect(rows.filter({ hasText: /SIMULATED vote (castle|forest|sea) · simulated/ }).first()).toBeVisible();
    for (const text of await rows.allTextContents()) expect(text).toMatch(/SIMULATED .+ · simulated/);
    await expect(drawer.getByRole('region', { name: 'The Herald’s chart', exact: true }))
      .toContainText(/Sample: Castle\s*\d+\.\d%/);
    await shot(page, 'gatehouse');

    // Beacons: headless cannot create a visual (beacons.visual.upsert is armed), so the UI makes one.
    await page.goto(`${SHELL_ORIGIN}/#/chamber/visuals`);
    const room = page.getByRole('region', { name: 'Core Beacons', exact: true });
    await expect(room.getByRole('figure', { name: 'Core configuration · sample picture · SIMULATED', exact: true })).toBeVisible();
    // The Deck moves the core workbench into the "More of the beacons" drawer.
    await room.getByRole('button', { name: 'More of the beacons', exact: true }).click();
    const more = room.getByRole('dialog', { name: 'More of the beacons', exact: true });
    await more.getByRole('textbox', { name: 'Visual ID', exact: true }).fill(VISUAL);
    await more.getByRole('textbox', { name: 'Visual name', exact: true }).fill('SIMULATED headless beacon');
    await more.getByRole('combobox', { name: 'Art style', exact: true }).selectOption({ label: 'Heraldic altar' });
    await more.getByRole('combobox', { name: 'Driven by', exact: true }).selectOption({ label: 'Bits cheer' });
    await more.getByRole('button', { name: 'Save visual to core', exact: true }).click();
    await expect(more.getByRole('region', { name: 'Reading and sample night', exact: true }).getByRole('status'))
      .toHaveText('Visual configuration saved by the core.');

    // Headless fires it: rehearsal beacon_fire reuses beacons.simulate (100 cheer bits).
    const visuals = await read('beacons.visual.list');
    expect(visuals.visuals.map(visual => visual.visual_id)).toContain(VISUAL);
    expect(await read('rehearsal.scenario.run', { scenario: 'beacon_fire', visual_id: VISUAL })).toEqual({ accepted: true });
    const preview = await until(() => ok('overlay_snapshot', { kind: 'beacons', visual_id: VISUAL }),
      value => field(value, 'simulated') === true);
    const intensity = field(field(field(preview, 'snapshot'), 'intensity'), 'intensity');
    console.log(`[headless] beacons snapshot simulated=${String(field(preview, 'simulated'))} intensity=${String(intensity)}`);
    expect(typeof intensity === 'number' && intensity > 0).toBe(true);
    // beacons.simulate never writes the contribution ledger or the event stream
    // (cc-core/src/beacons/simulate_overlay.rs), so a fire leaves both empty.
    const contributions = await read('beacons.contribution.list', { limit: 100 });
    expect(contributions.items).toEqual([]);
    const fired = await live().eventsSince(0);
    expect(fired.events.filter(event => event.kind.startsWith('beacons.'))).toEqual([]);

    // The desktop room lists the visual; its preview reads only its own test fires (finding).
    await page.reload();
    await expect(room.getByRole('radiogroup', { name: 'Beacon visuals', exact: true })
      .getByRole('radio', { name: /^SIMULATED headless beacon,/ })).toBeChecked();
    const selected = room.getByRole('region', { name: 'The selected beacon', exact: true });
    await expect(selected.getByRole('heading', { name: 'SIMULATED headless beacon', exact: true })).toBeVisible();
    // The room does not reflect the headless fire: it stays at 0% blaze (finding).
    await expect(selected.getByRole('paragraph').filter({ hasText: /^0%\s*blaze$/ })).toBeVisible();
    await shot(page, 'beacons');
    console.log(`[headless] beacons room: ${(await room.innerText()).replaceAll('\n', ' | ').slice(0, 300)}`);

    // The headless fire is visible on the beacon's own browser source, SIMULATED.
    const overlay = await browser.newPage();
    const verifyOverlay = await guardPage(overlay, live().overlayOrigin);
    try {
      await overlay.goto(`${live().overlayOrigin}/beacons/${VISUAL}`);
      await expect(overlay.locator('#scene')).toHaveAttribute('data-simulated', 'true');
      await expect(overlay.locator('#scene')).toHaveAttribute('data-intensity', '1');
      await expect(overlay.locator('[data-simulated-badge]')).toBeVisible();
      await shot(overlay, 'beacons-overlay');
      await overlay.goto(`${live().overlayOrigin}/gatehouse/current`);
      const bar = overlay.getByRole('main', { name: 'Consensus vote bar', exact: true });
      await expect(bar.locator(':scope > p')).toHaveText('SIMULATED');
      await shot(overlay, 'gatehouse-overlay');
      await overlay.goto('about:blank');
      verifyOverlay();
    } finally { await overlay.close(); }

    // Nothing armed reached the core except the UI's own visual save; art.status was answered in the page.
    const sent = [...new Set(methods())].sort();
    console.log(`[headless] UI rpc methods: ${sent.join(', ')}`);
    expect(sent.filter(method => method !== 'beacons.art.status' && ARMED.some(armed => armed === method)))
      .toEqual(['beacons.visual.upsert']);
    await page.goto('about:blank');
    verify();
  });

  test('3a subprocess: cc run - answers a 4-line script with 4 ok NDJSON lines', async () => {
    const script = [
      { tool: 'status_get' },
      { tool: 'rehearsal_start' },
      { tool: 'rehearsal_scenario_run', args: { scenario: 'vote_round' } },
      { tool: 'gatehouse_consensus_get', args: CONSENSUS },
    ].map(step => JSON.stringify(step)).join('\n');
    const result = await runNode(CC, ['run', '-'], `${script}\n`, exe);
    console.log(`[headless] cc run exit=${result.code} in ${result.ms} ms`);
    const lines = result.stdout.trim().split('\n').map(text => line(text));
    expect(lines.map(value => [field(value, 'tool'), field(value, 'ok')])).toEqual([
      ['status_get', true], ['rehearsal_start', true], ['rehearsal_scenario_run', true], ['gatehouse_consensus_get', true],
    ]);
    expect(result.code).toBe(0);
    expect(CAPABILITY.test(result.stdout + result.stderr)).toBe(false);
  });

  test('3b subprocess: cc call of an armed tool is refused locally', async () => {
    const result = await runNode(CC, ['call', 'gatehouse_ban_confirm', '{}'], '', exe);
    console.log(`[headless] cc call gatehouse_ban_confirm exit=${result.code}: ${result.stderr.split('\n')[0] ?? ''}`);
    expect([1, 2]).toContain(result.code);
    expect(result.stderr).toContain('unknown tool: gatehouse_ban_confirm');
    expect(result.stdout).toBe('');
    expect(CAPABILITY.test(result.stdout + result.stderr)).toBe(false);
  });

  test('3c subprocess: cc-mcp over stdio lists 27 tools, calls two and exits 0', async () => {
    const mcp = mcpClient(exe);
    const init = await mcp.request(1, 'initialize',
      { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'e2e-headless', version: '0' } });
    expect(field(field(init, 'result'), 'protocolVersion')).toBe('2025-06-18');
    mcp.notify('notifications/initialized');
    const list = field(field(await mcp.request(2, 'tools/list', {}), 'result'), 'tools');
    expect(Array.isArray(list) ? list.length : -1).toBe(TOOLS.length);
    for (const [id, name, args] of [[3, 'status_get', {}], [4, 'rehearsal_scenario_run', { scenario: 'vote_round' }]] as const) {
      const called = field(await mcp.request(id, 'tools/call', { name, arguments: args }), 'result');
      expect(field(called, 'isError'), `${name} isError`).toBe(false);
      const content = field(called, 'content');
      const text = Array.isArray(content) ? field(content[0], 'text') : undefined;
      console.log(`[headless] mcp ${name}: ${typeof text === 'string' ? text.replaceAll('\n', ' ').slice(0, 200) : 'no text'}`);
    }
    const exit = await mcp.end(10_000);
    console.log(`[headless] cc-mcp exit=${exit.code} ${exit.ms} ms after stdin closed`);
    expect(exit.code).toBe(0);
    const { stdout, stderr } = mcp.output();
    expect(CAPABILITY.test(stdout + stderr)).toBe(false);
  });

  test('4 teardown: closing the session removes its temp root', async () => {
    await live().close();
    await expect(access(root)).rejects.toThrow();
    const left = [...await headlessRoots()].filter(name => !before.has(name));
    expect(left, 'no cc-headless temp root survives (library, cc and cc-mcp)').toEqual([]);
  });
});
