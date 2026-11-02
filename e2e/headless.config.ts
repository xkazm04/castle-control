import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { defineConfig } from '@playwright/test';
import { repo } from './inventory.ts';

// One-time headless lane: packages/headless drives a real cc-headless core,
// then the desktop UI in Chrome (CORE mode) reads the same core. Not part of
// pnpm gate or the night lanes. Run with `pnpm e2e:headless`.
const PLAYWRIGHT_VERSION = '1.64.1';
const installed: unknown = createRequire(import.meta.url)('@playwright/test/package.json');
if (!installed || typeof installed !== 'object' || !('version' in installed) || installed.version !== PLAYWRIGHT_VERSION) {
  throw new Error(`The headless lane requires @playwright/test@${PLAYWRIGHT_VERSION}.`);
}

const out = resolve(process.env.HEADLESS_OUT ?? join(repo, 'target', 'e2e-headless'));
// Its own port: never 5173 (tauri dev), 5174/5274 (e2e), 5177 or 5284 (night).
const port = Number(process.env.CC_HEADLESS_PORT ?? 5291);
const vite = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: '.',
  testMatch: 'headless.spec.ts',
  tsconfig: './tsconfig.json',
  outputDir: join(out, 'test-results'),
  fullyParallel: false,
  workers: 1,
  // A retry is a manual, logged decision (see e2e/README.md), never automatic.
  retries: 0,
  forbidOnly: true,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['json', { outputFile: join(out, 'report.json') }]],
  // Exposed to the spec; never a capability. `lane` keeps the default e2e lane
  // (whose testMatch also matches this file) from ever starting a core.
  metadata: { lane: 'headless', vite, out },
  use: {
    channel: 'chrome', headless: true, viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block', reducedMotion: 'reduce',
    // No traces or video: they would record the session capability.
    trace: 'off', screenshot: 'only-on-failure', video: 'off',
    // As night.config.ts: route-fulfilled shell documents have no IP address
    // space, so Local Network Access would refuse their loopback core calls.
    launchOptions: { args: ['--disable-features=LocalNetworkAccessChecks'] },
  },
  projects: [{ name: 'headless-chrome' }],
  webServer: {
    command: `pnpm --config.verify-deps-before-run=false --filter @castle-control/desktop exec vite --host 127.0.0.1 --port ${port} --strictPort`,
    cwd: repo, url: vite, reuseExistingServer: false,
    timeout: 60_000, stdout: 'pipe', stderr: 'pipe',
  },
});
