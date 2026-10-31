import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { loopback } from '../network.ts';
import { builtOrigin, freePort, LaneSkip, launchApp, nativeTitle, nightOut, startVite, windowTitle } from './launch.ts';
import type { App, LaneProcess, Variant, Vite } from './launch.ts';
import { demoStep, diffText, keepStep, overviewStep, roomSteps, settle, streamStep, visibleText } from './steps.ts';
import type { Step, TextDiff } from './steps.ts';

// One window per project; tests share it, so they run in file order in one worker.
test.describe.configure({ mode: 'default' });

type Watch = { requests: string[]; rpc: string[]; refused: string[]; sockets: string[]; console: string[]; page: string[] };
const watch = (): Watch => ({ requests: [], rpc: [], refused: [], sockets: [], console: [], page: [] });

let variant: Variant;
let app: App | undefined;
let skip: string | undefined;
let reference: { vite: Vite; browser: Browser; page: Page } | undefined;
const tauri = watch();
const vite = watch();
const diffs: Record<string, TextDiff> = {};
const started = new Date().toISOString();
let survivors: LaneProcess[] = [];
let mark = { console: 0, refused: 0, page: 0 };

function observe(page: Page, into: Watch): void {
  page.on('request', request => {
    into.requests.push(request.url());
    if (new URL(request.url()).pathname === '/rpc') into.rpc.push(request.url());
  });
  page.on('response', async response => {
    if (new URL(response.url()).pathname !== '/rpc' || response.ok()) return;
    const sent: unknown = response.request().postDataJSON();
    const method = sent && typeof sent === 'object' && 'method' in sent ? String(sent.method) : 'unknown';
    const answer: unknown = await response.json().catch((error: unknown) => ({ code: `unreadable: ${String(error)}` }));
    const error = answer && typeof answer === 'object' && 'error' in answer ? answer.error : answer;
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'none';
    into.refused.push(`${response.status()} ${method} ${code}`);
  });
  page.on('websocket', socket => into.sockets.push(socket.url()));
  page.on('console', message => {
    if (message.type() === 'error') into.console.push(`${message.text()} @ ${message.location().url}`);
  });
  page.on('pageerror', error => into.page.push(error.message));
}

/** Requests the window may make: its own origin plus loopback only; /rpc only in core mode, only to 127.0.0.1. */
function offPolicy(): string[] {
  const own = app?.origin ?? builtOrigin;
  const foreign = [...tauri.requests, ...tauri.sockets].filter(url => !url.startsWith(own) && !url.startsWith('data:') && !loopback(url));
  const rpc = variant === 'fixture' ? tauri.rpc : tauri.rpc.filter(url => new URL(url).hostname !== '127.0.0.1');
  return [...foreign.map(url => `foreign: ${url}`), ...rpc.map(url => `rpc: ${url}`)];
}

test.beforeAll(async () => {
  const info = test.info();
  info.setTimeout(180_000);
  const metadata: unknown = info.project.metadata;
  variant = metadata && typeof metadata === 'object' && 'variant' in metadata && metadata.variant === 'fixture' ? 'fixture' : 'built';
  try {
    app = await launchApp(variant);
  } catch (error) {
    if (!(error instanceof LaneSkip)) throw error;
    skip = error.message;
    console.log(`[tauri lane] ${variant} skipped: ${skip}`);
    return;
  }
  observe(app.page, tauri);
  // Reload once attached so the whole boot (first /rpc, first errors) is observed.
  await app.page.reload({ timeout: 30_000 });
  const size = await app.page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const server = await startVite(await freePort());
  const browser = await chromium.launch({ channel: 'chrome', headless: true, timeout: 30_000 });
  const page = await browser.newPage({ viewport: size });
  reference = { vite: server, browser, page };
  observe(page, vite);
  await page.goto(`${server.origin}/#/keep`, { timeout: 30_000 });
});

test.afterAll(async () => {
  await reference?.browser.close();
  reference?.vite.stop();
  survivors = app ? await app.close() : [];
  mkdirSync(nightOut, { recursive: true });
  // A failed test restarts the worker and relaunches the window; each launch appends.
  const file = join(nightOut, `tauri-summary-${variant}.json`);
  const previous: unknown = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined;
  const launches: unknown[] = previous && typeof previous === 'object' && 'launches' in previous && Array.isArray(previous.launches) ? previous.launches : [];
  launches.push({
    started, finished: new Date().toISOString(),
    status: skip ? `skipped: ${skip}` : 'ran',
    window: app ? { pid: app.pid, cdp_port: app.cdpPort, origin: app.origin } : undefined,
    requests: tauri.requests.length, rpc: tauri.rpc.length, rpc_refused: tauri.refused, websockets: tauri.sockets,
    off_policy: offPolicy(), console_errors: tauri.console, page_errors: tauri.page,
    vite_console_errors: vite.console, vite_page_errors: vite.page,
    text_diff: diffs, survivors,
  });
  writeFileSync(file, `${JSON.stringify({ lane: 'tauri', variant, launches }, null, 2)}\n`);
  expect(survivors, 'No lane process (exe or WebView2) may outlive the lane').toEqual([]);
});

/**
 * The offline built core has no Twitch bridge or OBS adapter. These two reads answer
 * the typed `unavailable` error with HTTP 400 (documented in apps/desktop/README.md:
 * the shell shows UNKNOWN), and WebView2 logs each 400 as "Failed to load resource".
 * Only that exact pairing is excused; any other refusal or console error fails.
 */
const offlineRefusals = new Set(['400 bridge.status.get unavailable', '400 obs.status.get unavailable']);
const refusalLog = /^Failed to load resource: the server responded with a status of 400 \(Bad Request\) @ http:\/\/127\.0\.0\.1:\d+\/rpc$/;
/** WebView2 probes /favicon.ico on its own; the Vite dev server ships none (the fixture variant's only 404). */
const faviconProbe = /^Failed to load resource: the server responded with a status of 404 \(Not Found\) @ http:\/\/127\.0\.0\.1:\d+\/favicon\.ico$/;

function unexcused(all: string[], refused: string[]): string[] {
  const consoleErrors = variant === 'fixture' ? all.filter(line => !faviconProbe.test(line)) : all;
  if (variant !== 'built') return [...consoleErrors, ...refused.map(line => `rpc refused: ${line}`)];
  const strange = refused.filter(line => !offlineRefusals.has(line)).map(line => `rpc refused: ${line}`);
  const logs = consoleErrors.filter(line => refusalLog.test(line));
  const extra = logs.length > refused.length ? logs.slice(refused.length) : [];
  return [...strange, ...consoleErrors.filter(line => !refusalLog.test(line)), ...extra];
}

// Marks advance from test to test (not reset per test), so the first test also owns the boot.
test.beforeEach(() => { test.skip(skip !== undefined, `skipped: ${skip}`); });

test.afterEach(() => {
  if (skip) return;
  const fresh = { console: tauri.console.slice(mark.console), refused: tauri.refused.slice(mark.refused), page: tauri.page.slice(mark.page) };
  mark = { console: tauri.console.length, refused: tauri.refused.length, page: tauri.page.length };
  expect(fresh.page, 'page errors in the Tauri window').toEqual([]);
  expect(unexcused(fresh.console, fresh.refused), 'console errors in the Tauri window').toEqual([]);
  expect(offPolicy(), 'network policy in the Tauri window').toEqual([]);
});

async function visit(step: Step): Promise<void> {
  if (!app || !reference) throw new Error('Lane not launched');
  await settle(app.page, step);
  await settle(reference.page, step);
  const shots = join(nightOut, 'screenshots', variant);
  mkdirSync(shots, { recursive: true });
  await app.page.screenshot({ path: join(shots, `${step.name}.png`), timeout: 20_000, caret: 'hide' });
  await reference.page.screenshot({ path: join(shots, `${step.name}.vite.png`), timeout: 20_000, caret: 'hide' });
  const diff = diffText(await visibleText(app.page), await visibleText(reference.page));
  diffs[step.name] = diff;
  await test.info().attach(`text-diff-${step.name}.json`, { body: JSON.stringify(diff, null, 2), contentType: 'application/json' });
  const differing = diff.only_tauri_masked.length + diff.only_vite_masked.length;
  test.info().annotations.push({ type: 'text-diff', description: `${step.name}: ${differing} masked lines differ from Vite` });
  expect(diff.tauri_lines, 'the Tauri window rendered visible text').toBeGreaterThan(0);
}

test('window title', async () => {
  if (!app) throw new Error('Lane not launched');
  const pid = app.pid;
  await expect.poll(() => nativeTitle(pid), { timeout: 15_000 }).toBe(windowTitle(variant));
  expect(await app.page.title()).toBe('Castle Control');
});

test('the Keep', async () => { await visit(keepStep); });

for (const [room, esc] of roomSteps) {
  test(`room ${room.name.slice(-1)} by key, then Esc to the Keep`, async () => {
    await visit(room);
    await visit(esc);
  });
}

test('Overview by key 0', async () => { await visit(overviewStep); });
test('#/stream', async () => { await visit(streamStep); });
test('#/demo', async () => { await visit(demoStep); });

test('network: no /rpc in fixture mode, loopback-only /rpc in the built core', async () => {
  expect(tauri.requests.length, 'the network watch saw the boot').toBeGreaterThan(0);
  if (variant === 'fixture') expect(tauri.rpc).toEqual([]);
  else for (const url of tauri.rpc) expect(new URL(url).hostname).toBe('127.0.0.1');
  test.info().annotations.push({ type: 'rpc', description: `${variant}: ${tauri.rpc.length} /rpc calls, ${tauri.requests.length} requests` });
});
