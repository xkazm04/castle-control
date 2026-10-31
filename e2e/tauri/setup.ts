import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { nightOut, variants } from './launch.ts';
import laneSweep from './sweep.ts';

/** Global setup: start this run's per-launch summaries fresh, then sweep leftovers. */
export default async function laneSetup(): Promise<void> {
  for (const variant of variants) rmSync(join(nightOut, `tauri-summary-${variant}.json`), { force: true });
  await laneSweep();
}
