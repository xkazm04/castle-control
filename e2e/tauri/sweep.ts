import { sweep } from './launch.ts';

/** Global teardown (and part of setup): kill any lane exe or lane-profile WebView2 a crashed run left. */
export default async function laneSweep(): Promise<void> {
  if (process.platform !== 'win32') return;
  const survivors = await sweep();
  console.log(`[tauri lane] process sweep: ${survivors.length} survivors`);
  if (survivors.length) throw new Error(`Lane processes survived the sweep: ${JSON.stringify(survivors)}`);
}
