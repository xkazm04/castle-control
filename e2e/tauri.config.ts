import { join } from 'node:path';
import { defineConfig } from '@playwright/test';
import { nightOut } from './tauri/launch.ts';

// The Tauri lane: the real cc-desktop window over WebView2 CDP. Build first with
// `node e2e/tauri/build.ts`. Output goes to NIGHT_OUT (default e2e/tauri-results).
export default defineConfig({
  testDir: './tauri',
  testMatch: 'smoke.spec.ts',
  tsconfig: './tsconfig.json',
  outputDir: join(nightOut, 'test-results'),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 60_000,
  globalTimeout: 15 * 60_000,
  globalSetup: './tauri/setup.ts',
  globalTeardown: './tauri/sweep.ts',
  reporter: [
    ['list'],
    ['json', { outputFile: join(nightOut, 'tauri-results.json') }],
    ['html', { outputFolder: join(nightOut, 'html'), open: 'never' }],
  ],
  projects: [
    { name: 'tauri-built', metadata: { variant: 'built' } },
    { name: 'tauri-fixture', metadata: { variant: 'fixture' } },
  ],
});
