import { createRequire } from 'node:module';
import { defineConfig } from '@playwright/test';
import { repo } from './inventory.ts';

// Exact pin, released 2025-09-23; older than two weeks on the dispatch date.
export const PLAYWRIGHT_VERSION = '1.55.1';
const installed: unknown = createRequire(import.meta.url)('@playwright/test/package.json');
if (!installed || typeof installed !== 'object' || !('version' in installed) || installed.version !== PLAYWRIGHT_VERSION) {
  throw new Error(`This lane requires @playwright/test@${PLAYWRIGHT_VERSION}; ask the Director to install it in main.`);
}

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
    channel: 'chrome', headless: true, baseURL: 'http://127.0.0.1:5173',
    serviceWorkers: 'block', reducedMotion: 'reduce', trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chrome-1440x900', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'chrome-1280x800', use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: 'pnpm --config.verify-deps-before-run=false --filter @castle-control/desktop exec vite --host 127.0.0.1 --port 5173 --strictPort',
    cwd: repo, url: 'http://127.0.0.1:5173', reuseExistingServer: false,
    timeout: 60_000, stdout: 'pipe', stderr: 'pipe',
  },
});
