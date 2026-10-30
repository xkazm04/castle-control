import { createRequire } from 'node:module';
import { defineConfig } from '@playwright/test';
import { repo } from './inventory.ts';

// Exact pin, released 2025-09-23; older than two weeks on the dispatch date.
export const PLAYWRIGHT_VERSION = '1.64.1';
const installed: unknown = createRequire(import.meta.url)('@playwright/test/package.json');
if (!installed || typeof installed !== 'object' || !('version' in installed) || installed.version !== PLAYWRIGHT_VERSION) {
  throw new Error(`This lane requires @playwright/test@${PLAYWRIGHT_VERSION}; ask the Director to install it in main.`);
}

// 5173 is the desktop dev server's own port (tauri dev); the lane takes its own so it never collides.
const port = Number(process.env.CC_E2E_PORT ?? 5174);
const origin = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  tsconfig: './tsconfig.json',
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 30_000,
  reporter: 'list',
  use: {
    channel: 'chrome', headless: true, baseURL: origin,
    serviceWorkers: 'block', reducedMotion: 'reduce', trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chrome-1440x900', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'chrome-1280x800', use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `pnpm --config.verify-deps-before-run=false --filter @castle-control/desktop exec vite --host 127.0.0.1 --port ${port} --strictPort`,
    cwd: repo, url: origin, reuseExistingServer: false,
    timeout: 60_000, stdout: 'pipe', stderr: 'pipe',
  },
});
