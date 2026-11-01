import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { repo } from '../inventory.ts';

/**
 * Tauri lane launcher. It starts the real cc-desktop window (Tauri + WebView2)
 * with no options, exposes WebView2's CDP endpoint through the documented
 * WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS variable, and attaches Playwright.
 * Every wait has a deadline; every process it starts is killed by tree.
 */
export type Variant = 'built' | 'fixture';
export const variants: readonly Variant[] = ['built', 'fixture'];

export const exeDir = join(repo, 'target', 'tauri-e2e');
/** Unique image names: an orphan sweep can never touch the owner's own cc-desktop.exe. */
export const exeName = (variant: Variant): string => `cc-desktop-e2e-${variant}.exe`;
export const exePath = (variant: Variant): string => join(exeDir, exeName(variant));
/** Every WebView2 profile this lane creates lives under a directory with this prefix. */
export const profileMarker = 'cc-tauri-e2e-';
/**
 * The fixture build loads a compiled-in devUrl. tauri.conf.json says 5173 (a person's
 * `tauri dev` port, often busy), so build.ts merges TAURI_CONFIG to move it to this
 * lane-only port. 5174 is pnpm e2e, 5175 the site lane.
 */
export const fixtureDevPort = 5177;
export const fixtureTauriConfig = JSON.stringify({ build: { devUrl: `http://127.0.0.1:${fixtureDevPort}` } });
export const builtOrigin = 'http://tauri.localhost';
export const windowTitle = (variant: Variant): string =>
  variant === 'built' ? 'Castle Control' : 'Castle Control — SIMULATED';

export const nightOut = resolve(repo, process.env.NIGHT_OUT ?? 'e2e/tauri-results');

/** A launch problem that means "this lane cannot run here", reported as skipped. */
export class LaneSkip extends Error {}

const sleep = (ms: number) => new Promise<void>(done => setTimeout(done, ms));

async function until<T>(label: string, ms: number, probe: () => Promise<T | undefined>, abort?: () => string | undefined): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    const reason = abort?.();
    if (reason) throw new LaneSkip(`${label}: ${reason}`);
    const value = await probe();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new LaneSkip(`${label}: timed out after ${ms} ms`);
    await sleep(250);
  }
}

async function fetchOk(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    return response.ok;
  } catch {
    // Not listening yet is the expected state while polling; a real failure surfaces at the deadline.
    return false;
  }
}

export function portFree(port: number): Promise<boolean> {
  return new Promise(done => {
    const server = createServer();
    server.once('error', () => done(false));
    server.listen(port, '127.0.0.1', () => server.close(() => done(true)));
  });
}

export function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const server = createServer();
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => port ? done(port) : fail(new Error('No free port')));
    });
  });
}

function powershell(script: string): string {
  // UTF-8 out, so a title's em dash survives the console code page.
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `[Console]::OutputEncoding = [Text.Encoding]::UTF8; ${script}`],
    { encoding: 'utf8', timeout: 30_000, windowsHide: true });
  if (result.error) throw result.error;
  return result.stdout.trim();
}

export type LaneProcess = { pid: number; name: string };

/** Lane processes alive now: our exe copies and WebView2 hosts using a lane profile. */
export function laneProcesses(): LaneProcess[] {
  const names = variants.map(exeName).map(name => `'${name}'`).join(',');
  const out = powershell(`@(Get-CimInstance Win32_Process | Where-Object { @(${names}) -contains $_.Name -or ($_.Name -eq 'msedgewebview2.exe' -and $_.CommandLine -like '*${profileMarker}*') } | ForEach-Object { @{ pid = $_.ProcessId; name = $_.Name } }) | ConvertTo-Json -Compress`);
  if (!out) return [];
  const parsed: unknown = JSON.parse(out);
  const list: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
  return list.flatMap(item => item && typeof item === 'object' && 'pid' in item && 'name' in item
    && typeof item.pid === 'number' && typeof item.name === 'string' ? [{ pid: item.pid, name: item.name }] : []);
}

export function killTree(pid: number | undefined): void {
  if (!pid) return;
  // Exit 128 means the process is already gone; that is the goal state.
  spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { timeout: 15_000, windowsHide: true, stdio: 'ignore' });
}

/** Kill every lane process, then prove none remain. Returns survivors (empty on success). */
export async function sweep(ms = 15_000): Promise<LaneProcess[]> {
  const deadline = Date.now() + ms;
  for (;;) {
    const alive = laneProcesses();
    if (!alive.length || Date.now() > deadline) return alive;
    for (const { pid } of alive) killTree(pid);
    await sleep(500);
  }
}

export function nativeTitle(pid: number): string {
  return powershell(`(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).MainWindowTitle`);
}

export type Vite = { origin: string; stop: () => void };

/** The desktop workspace's own Vite dev server, started directly by node for a clean kill. */
export async function startVite(port: number): Promise<Vite> {
  const bin = join(repo, 'apps/desktop/node_modules/vite/bin/vite.js');
  if (!existsSync(bin)) throw new LaneSkip(`vite not installed at ${bin}; run pnpm install --frozen-lockfile`);
  if (!await portFree(port)) throw new LaneSkip(`port ${port} is busy`);
  const child = spawn(process.execPath, [bin, '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    { cwd: join(repo, 'apps/desktop'), stdio: 'ignore', windowsHide: true });
  const origin = `http://127.0.0.1:${port}`;
  const stop = () => killTree(child.pid);
  try {
    await until(`vite on ${port}`, 60_000, async () => await fetchOk(`${origin}/`) || undefined, () => exited(child));
  } catch (error) {
    stop();
    throw error;
  }
  return { origin, stop };
}

function exited(child: ChildProcess): string | undefined {
  return child.exitCode !== null || child.signalCode !== null
    ? `process exited early (code ${child.exitCode ?? child.signalCode})` : undefined;
}

export type App = {
  variant: Variant; pid: number; cdpPort: number; origin: string;
  browser: Browser; page: Page; profile: string; vite?: Vite | undefined;
  close: () => Promise<LaneProcess[]>;
};

/** Launch one variant with no options and attach over CDP. Throws LaneSkip when it cannot run here. */
export async function launchApp(variant: Variant): Promise<App> {
  if (process.platform !== 'win32') throw new LaneSkip('WebView2 CDP needs Windows');
  const exe = exePath(variant);
  if (!existsSync(exe)) throw new LaneSkip(`${exe} missing; run node e2e/tauri/build.ts`);
  const leftovers = await sweep();
  if (leftovers.length) throw new Error(`Orphaned lane processes survived the pre-launch sweep: ${JSON.stringify(leftovers)}`);
  let vite: Vite | undefined;
  if (variant === 'fixture') vite = await startVite(fixtureDevPort);
  const origin = variant === 'fixture' ? `http://127.0.0.1:${fixtureDevPort}` : builtOrigin;
  const cdpPort = await freePort();
  const profile = mkdtempSync(join(tmpdir(), profileMarker));
  // No arguments: the app's offline launch. --login, --client-id and --test-channel are never passed.
  const child = spawn(exe, [], {
    cwd: exeDir, stdio: 'ignore', windowsHide: false,
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${cdpPort}`,
      // An isolated, throwaway WebView2 profile: never the owner's app-data profile.
      WEBVIEW2_USER_DATA_FOLDER: profile,
    },
  });
  let browser: Browser | undefined;
  const close = async (): Promise<LaneProcess[]> => {
    await browser?.close().catch((error: unknown) => console.warn(`[tauri lane] CDP disconnect: ${String(error)}`));
    killTree(child.pid);
    vite?.stop();
    const survivors = await sweep();
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
    return survivors;
  };
  try {
    const pid = child.pid;
    if (!pid) throw new LaneSkip(`${exe} did not start`);
    await until('WebView2 CDP endpoint', 45_000,
      async () => await fetchOk(`http://127.0.0.1:${cdpPort}/json/version`) || undefined, () => exited(child));
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`, { timeout: 20_000 });
    const connected = browser;
    const page = await until('app page over CDP', 20_000, async () =>
      connected.contexts().flatMap(context => context.pages()).find(candidate => candidate.url().startsWith(origin)));
    return { variant, pid, cdpPort, origin, browser: connected, page, profile, vite, close };
  } catch (error) {
    const survivors = await close();
    if (survivors.length) console.error(`[tauri lane] survivors after failed launch: ${JSON.stringify(survivors)}`);
    throw error;
  }
}
