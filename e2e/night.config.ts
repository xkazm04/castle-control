import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { defineConfig } from '@playwright/test';
import { repo } from './inventory.ts';

// Night lanes: the desktop UI in Chrome against a real e2e-night core. The core
// lane runs every e2e/night spec except obs.spec.ts; scripts/night/obs.mjs runs
// the OBS lane with CC_NIGHT_OBS_LANE=1 after isolating a separate OBS.
const PLAYWRIGHT_VERSION = '1.64.1';
const installed: unknown = createRequire(import.meta.url)('@playwright/test/package.json');
if (!installed || typeof installed !== 'object' || !('version' in installed) || installed.version !== PLAYWRIGHT_VERSION) {
  throw new Error(`The night lanes require @playwright/test@${PLAYWRIGHT_VERSION}.`);
}

const out = resolve(process.env.NIGHT_OUT ?? join(repo, 'e2e', 'night-results'));
// Its own port: never the desktop dev server (5173) or the e2e lane (5174/5274).
const port = Number(process.env.CC_NIGHT_PORT ?? 5284);
const vite = `http://127.0.0.1:${port}`;
const obsLane = process.env.CC_NIGHT_OBS_LANE === '1';

export default defineConfig({
  testDir: './night',
  testMatch: obsLane ? '**/obs.spec.ts' : '**/*.spec.ts',
  testIgnore: obsLane ? [] : ['**/obs.spec.ts'],
  tsconfig: './tsconfig.json',
  outputDir: join(out, 'test-results'),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [
    ['list'],
    ['json', { outputFile: process.env.PLAYWRIGHT_JSON_OUTPUT_FILE ?? join(out, 'report.json') }],
    ['html', { outputFolder: process.env.PLAYWRIGHT_HTML_OUTPUT_DIR ?? join(out, 'html'), open: 'never' }],
  ],
  // Exposed to specs; never a capability.
  metadata: { vite, out },
  use: {
    channel: 'chrome', headless: true, viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block', reducedMotion: 'reduce',
    // No traces: they would record the session capability and the per-run OBS password.
    trace: 'off', screenshot: 'only-on-failure', video: 'off',
    // Route-fulfilled shell documents have no IP address space, so Chrome's
    // Local Network Access check would refuse their loopback core calls. The
    // real webview has no such check; the core still enforces Origin and token.
    launchOptions: { args: ['--disable-features=LocalNetworkAccessChecks'] },
  },
  projects: [{ name: 'night-chrome' }],
  webServer: {
    command: `pnpm --config.verify-deps-before-run=false --filter @castle-control/desktop exec vite --host 127.0.0.1 --port ${port} --strictPort`,
    cwd: repo, url: vite, reuseExistingServer: false,
    timeout: 60_000, stdout: 'pipe', stderr: 'pipe',
  },
});
