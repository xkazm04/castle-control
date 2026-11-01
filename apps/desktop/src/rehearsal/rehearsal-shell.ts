import type { RehearsalShell } from './rehearsal-core.js';

// The official isTauri() helper reads this runtime flag. Reading it here keeps
// the SDK deferred until a human presses Start/Leave, including in Vite previews.
const isNative = () => {
  const runtime: object = globalThis;
  return 'isTauri' in runtime && runtime.isTauri === true;
};

const relaunch: RehearsalShell = async command => {
  // Destructure the dynamic module namespace: a named import alias is still a
  // core invoke alias to the parity scanner. Native IPC has a different door
  // and signature; neither native command is a core RPC method.
  const { invoke: nativeInvoke } = await import('@tauri-apps/api/core');
  if (command === 'enter_rehearsal') await nativeInvoke<void>('enter_rehearsal');
  else if (command === 'leave_rehearsal') await nativeInvoke<void>('leave_rehearsal');
  else throw new Error('Unsupported desktop command');
};

/** Only the built native core may relaunch; Vite/fixture mode never obtains this door. */
export function rehearsalShell(mode: 'fixture' | 'core', native = isNative(), send: RehearsalShell = relaunch): RehearsalShell | undefined {
  if (mode !== 'core' || !native) return;
  return async command => {
    if (command !== 'enter_rehearsal' && command !== 'leave_rehearsal') throw new Error('Unsupported desktop command');
    await send(command);
  };
}
