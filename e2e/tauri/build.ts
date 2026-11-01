import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { repo } from '../inventory.ts';
import { exeDir, exePath, fixtureTauriConfig } from './launch.ts';
import type { Variant } from './launch.ts';

/**
 * Builds both desktop variants the way apps/desktop/README.md does, then copies
 * each exe under a lane-only name (target/tauri-e2e/cc-desktop-e2e-<variant>.exe):
 *   built   = frontend build + `cargo build -p cc-desktop --features custom-protocol`
 *             (embeds apps/desktop/dist, served at http://tauri.localhost)
 *   fixture = `cargo build -p cc-desktop` with TAURI_CONFIG moving devUrl to the
 *             lane port (dev shell, injects exactly { mode: 'fixture' })
 * Timings go to target/tauri-e2e/build.json.
 */
function step(label: string, command: string, args: string[], env: Record<string, string> = {}): { label: string; command: string; seconds: number } {
  const started = Date.now();
  const shim = command === 'pnpm';
  // TAURI_CONFIG is merged at compile time; only the fixture build may carry it.
  const merged: Record<string, string | undefined> = { ...process.env, ...env };
  if (!env.TAURI_CONFIG) delete merged.TAURI_CONFIG;
  const result = spawnSync(shim ? 'cmd.exe' : command, shim ? ['/d', '/s', '/c', `pnpm ${args.join(' ')}`] : args,
    { cwd: repo, stdio: 'inherit', timeout: 30 * 60_000, env: merged });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} exited ${result.status}`);
  const seconds = Math.round((Date.now() - started) / 100) / 10;
  console.log(`[tauri build] ${label}: ${seconds}s`);
  const prefix = Object.entries(env).map(([name, value]) => `${name}=${value} `).join('');
  return { label, command: `${prefix}${command} ${args.join(' ')}`, seconds };
}

const cargo = ['build', '--locked', '--config', 'net.offline=false', '-p', 'cc-desktop'];
const copy = (variant: Variant) => copyFileSync(join(repo, 'target/debug/cc-desktop.exe'), exePath(variant));
const started = Date.now();
mkdirSync(exeDir, { recursive: true });
const steps = [step('frontend', 'pnpm', ['--config.verify-deps-before-run=false', '--filter', '@castle-control/desktop', 'build'])];
steps.push(step('built exe', 'cargo', [...cargo, '--features', 'custom-protocol']));
copy('built');
steps.push(step('fixture exe', 'cargo', cargo, { TAURI_CONFIG: fixtureTauriConfig }));
copy('fixture');
const total = Math.round((Date.now() - started) / 100) / 10;
writeFileSync(join(exeDir, 'build.json'), `${JSON.stringify({ finished: new Date().toISOString(), total_seconds: total, steps }, null, 2)}\n`);
console.log(`[tauri build] total: ${total}s -> ${exeDir}`);
