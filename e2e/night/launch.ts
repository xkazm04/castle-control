// Night lane launcher: builds and starts the e2e-night core, then opens the
// desktop UI in Chrome in CORE mode. The session capability lives only in this
// test process and in the page's init script; it is never logged, written to a
// file, put in a URL or attached to a report.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { Page } from '@playwright/test';
import { repo } from '../inventory.ts';

type Contract = typeof import('../../packages/contract/src/index.ts');
type Methods = import('../../packages/contract/src/index.ts').RpcMethods;
type MethodContract<M extends keyof Methods> = import('../../packages/contract/src/index.ts').MethodContract<M>;
type JsonDoor = typeof import('../../packages/contract/src/door.mjs');
type Handoff = { endpoint: string; token: string; overlay_origin: string; obs_port: number };
/** Metadata the core's OBS relay reports; never a password or capability. */
export type ObsReport = { request?: string; response?: string; id?: string; scene?: string; input?: string;
  url?: string; result?: boolean; code?: number };

const door: JsonDoor = await import(new URL('../../packages/contract/src/door.mjs', import.meta.url).href);
const contract: Contract = await import(new URL('../../packages/contract/src/index.ts', import.meta.url).href);
/** The webview origin the core already trusts (launch.rs BUILT_ORIGIN on Windows). */
export const SHELL_ORIGIN = 'http://tauri.localhost';
let built: Promise<string> | undefined;

export function buildNightCore(): Promise<string> {
  built ??= build();
  return built;
}

async function build(): Promise<string> {
  const child = spawn('cargo', ['build', '--locked', '-p', 'cc-core', '--example', 'e2e-night',
    '--message-format=json-render-diagnostics'], {
    cwd: repo, windowsHide: true, stdio: 'pipe', env: { ...process.env, CARGO_BUILD_JOBS: '6' },
  });
  const exited = new Promise<void>((resolve, reject) => {
    child.once('error', error => reject(new Error(`cargo spawn failed: ${error.message}`)));
    child.once('close', code => code === 0 ? resolve() : reject(new Error(`cargo exited (${code})`)));
  });
  child.stderr.on('data', (bytes: Buffer) => process.stderr.write(bytes));
  const lines = createInterface({ input: child.stdout });
  let executable: string | undefined;
  const deadline = setTimeout(() => child.kill(), 900_000);
  try {
    await Promise.all([exited, (async () => {
      for await (const line of lines) {
        const value = door.parseJson(line);
        if (value && typeof value === 'object' && 'reason' in value && value.reason === 'compiler-artifact'
          && 'target' in value && value.target && typeof value.target === 'object'
          && 'name' in value.target && value.target.name === 'e2e-night'
          && 'executable' in value && typeof value.executable === 'string') executable = value.executable;
      }
    })()]);
    if (!executable) throw new Error('Cargo did not report the e2e-night artifact');
    return executable;
  } finally { clearTimeout(deadline); lines.close(); }
}

function handoff(value: unknown): Handoff {
  if (!value || typeof value !== 'object' || Object.keys(value).sort().join(',') !== 'endpoint,obs_port,overlay_origin,token'
    || !('endpoint' in value) || typeof value.endpoint !== 'string'
    || !('token' in value) || typeof value.token !== 'string' || !/^[a-f0-9]{64}$/.test(value.token)
    || !('overlay_origin' in value) || typeof value.overlay_origin !== 'string'
    || !('obs_port' in value) || typeof value.obs_port !== 'number' || !Number.isInteger(value.obs_port)
    || value.obs_port < 1 || value.obs_port > 65535 || value.obs_port === 4455) {
    throw new Error('Invalid night core handoff');
  }
  const endpoint = new URL(value.endpoint);
  const overlay = new URL(value.overlay_origin);
  if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || endpoint.href !== `${endpoint.origin}/`
    || overlay.protocol !== 'http:' || overlay.hostname !== 'localhost' || value.overlay_origin !== overlay.origin) {
    throw new Error('Night core must use separate loopback origins');
  }
  return { endpoint: value.endpoint, token: value.token, overlay_origin: value.overlay_origin, obs_port: value.obs_port };
}

function obsReport(value: unknown): ObsReport | undefined {
  if (!value || typeof value !== 'object' || !('obs' in value) || !value.obs || typeof value.obs !== 'object') return;
  const report: ObsReport = {};
  for (const [key, field] of Object.entries(value.obs)) {
    if (['request', 'response', 'id', 'scene', 'input', 'url'].includes(key) && typeof field === 'string') {
      Object.assign(report, { [key]: field });
    }
    if (key === 'result' && typeof field === 'boolean') report.result = field;
    if (key === 'code' && typeof field === 'number') report.code = field;
  }
  return report;
}

export type NightCoreOptions = {
  /** Isolated SIMULATED rehearsal modules, with no Twitch login. */
  rehearsal?: boolean;
  /** An isolated OBS (never 4455). Without it the core starts its fake OBS peer. */
  obs?: { port: number; password: string };
  /** Native lane only: `live` (default) opts into quicknet; `off` keeps NoBeacon.
   * Rehearsal explicitly selects real quicknet in its composition, without a file. */
  lotsBeacon?: 'live' | 'off';
};

export async function startNightCore(options: NightCoreOptions = {}) {
  if (options.obs?.port === 4455) throw new Error('Refusing the owner OBS websocket port 4455');
  const executable = await buildNightCore();
  const parent = join(repo, 'target');
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(join(parent, 'e2e-night-'));
  const env: NodeJS.ProcessEnv = { ...process.env, CC_NIGHT_LOTS_BEACON: options.lotsBeacon ?? 'live',
    CC_NIGHT_REHEARSAL: options.rehearsal ? '1' : '0' };
  for (const key of ['CC_LIVE_TWITCH', 'CC_LIVE_OBS', 'CC_LIVE_FLOOR', 'CC_NIGHT_OBS_PORT', 'CC_NIGHT_OBS_PASSWORD']) delete env[key];
  if (options.obs) {
    env.CC_NIGHT_OBS_PORT = String(options.obs.port);
  }
  // Generated afresh; only the child environment and masked UI field receive it.
  const obsSecret = options.obs?.password ?? randomBytes(24).toString('hex');
  env.CC_NIGHT_OBS_PASSWORD = obsSecret;
  const reports: ObsReport[] = [];
  let child: ChildProcessWithoutNullStreams | undefined;
  let closed: Promise<void> | undefined;
  const close = async () => {
    if (child) {
      child.stdin.end();
      const exited = closed ?? Promise.resolve();
      const timer = setTimeout(() => child?.kill(), 5_000);
      await exited;
      clearTimeout(timer);
    }
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  };
  try {
    child = spawn(executable, [directory], { cwd: repo, windowsHide: true, stdio: 'pipe', env });
    const running = child;
    closed = new Promise<void>(resolve => running.once('close', () => resolve()));
    // Drain, but never publish runtime diagnostics.
    running.stderr.resume();
    const lines = createInterface({ input: running.stdout });
    const ready = await new Promise<Handoff>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Night core startup timed out')), 30_000);
      running.once('exit', () => reject(new Error('Night core exited before its handoff')));
      lines.once('line', line => {
        clearTimeout(timer);
        try { resolve(handoff(door.parseJson(line, { max_bytes: 1024 }))); }
        catch { reject(new Error('Night core returned an invalid handoff')); }
        lines.on('line', next => {
          const report = obsReport(door.parseJson(next, { max_bytes: 8192 }));
          if (report) reports.push(report);
        });
      });
    });
    const invoke = <M extends keyof Methods>(method: MethodContract<M>, params: unknown) =>
      contract.invokeMethod(ready.endpoint, ready.token, method, contract.parseMethodParams(method, params));
    return {
      overlayOrigin: ready.overlay_origin,
      endpoint: ready.endpoint,
      contract,
      invoke,
      /** Relay reports of CreateInput requests and responses, in arrival order. */
      obsReports: () => [...reports],
      /** Populate the actual masked field without putting secret values into Playwright action titles/errors. */
      async connectObsInUi(page: Page) {
        await page.getByRole('spinbutton', { name: 'OBS port', exact: true }).fill(String(ready.obs_port));
        // Tracing is disabled in night.config.ts. This argument is never printed or attached.
        await page.evaluate(secret => {
          const field = document.querySelector('input[name="password"]');
          if (!(field instanceof HTMLInputElement) || field.type !== 'password' || field.autocomplete !== 'off') {
            throw new Error('Missing masked OBS password field');
          }
          field.value = secret;
          field.dispatchEvent(new Event('input', { bubbles: true }));
        }, obsSecret);
        await page.getByRole('button', { name: 'Connect OBS', exact: true }).click();
      },
      /** Generated SIMULATED chat: `join` entrants or two-sided duel `ballots`. */
      chat(command: 'join' | 'ballots', count: number) { running.stdin.write(`${command} ${count}\n`); },
      /** Open the desktop UI in CORE mode at a hash route, served as the trusted shell origin. */
      async openDesktop(page: Page, viteOrigin: string, hash: string) {
        await serveShell(page, viteOrigin);
        const launch = { mode: 'core', endpoint: ready.endpoint, session_token: ready.token };
        // Same main-frame guard as launch.rs; main.tsx consumes and deletes it.
        await page.addInitScript(({ launch, host }) => {
          if (window === window.top && location.protocol === 'http:' && location.hostname === host && location.port === '') {
            Object.assign(window, { __CASTLE_CONTROL_LAUNCH__: launch });
          }
        }, { launch, host: new URL(SHELL_ORIGIN).hostname });
        await page.goto(`${SHELL_ORIGIN}/${hash}`);
      },
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
export type NightCore = Awaited<ReturnType<typeof startNightCore>>;

/**
 * The core refuses browser origins other than the Tauri webview's. Chrome loads
 * the Vite build under http://tauri.localhost by fulfilling every request for
 * that origin from the Vite server, so the page's own fetch and WebSocket calls
 * reach the real core with the Origin the shell would send. No product change.
 */
async function serveShell(page: Page, viteOrigin: string) {
  const context = page.context();
  await context.route(`${SHELL_ORIGIN}/**`, async route => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `${viteOrigin}${url.pathname}${url.search}` });
    await route.fulfill({ response });
  });
  // Vite's HMR socket has no server under the shell origin; hold it open, silent.
  await context.routeWebSocket(url => url.host === new URL(SHELL_ORIGIN).host, () => undefined);
}
