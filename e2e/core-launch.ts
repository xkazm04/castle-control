import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { repo } from './inventory.ts';

type Contract = typeof import('../packages/contract/src/index.ts');
type Methods = import('../packages/contract/src/index.ts').RpcMethods;
type MethodContract<M extends keyof Methods> = import('../packages/contract/src/index.ts').MethodContract<M>;
type JsonDoor = typeof import('../packages/contract/src/door.mjs');
type Handoff = { endpoint: string; token: string; overlay_origin: string };

// Resolve the worktree's public contract door, rather than a junction's checkout.
const contractUrl = new URL('../packages/contract/src/index.ts', import.meta.url);
const doorUrl = new URL('../packages/contract/src/door.mjs', import.meta.url);
const door: JsonDoor = await import(doorUrl.href);
const contract: Contract = await import(contractUrl.href);
let built: Promise<string> | undefined;

/** Cargo reports the actual artifact path, including configured target dirs. */
export function buildCoreLauncher(): Promise<string> {
  built ??= build();
  return built;
}

async function build(): Promise<string> {
  const child = spawn('cargo', ['build', '--locked', '-p', 'cc-core', '--example', 'e2e-lots',
    '--message-format=json-render-diagnostics'], {
    cwd: repo, windowsHide: true, stdio: 'pipe', env: { ...process.env, CARGO_BUILD_JOBS: '6' },
  });
  const exited = completion(child);
  const lines = createInterface({ input: child.stdout });
  let executable: string | undefined;
  // No capability exists during build. Diagnostics are safe; runtime output is
  // deliberately never inherited, forwarded, attached or included in an error.
  child.stderr.on('data', (bytes: Buffer) => process.stderr.write(bytes));
  const deadline = setTimeout(() => child.kill(), 600_000);
  try {
    await Promise.all([exited, (async () => {
      for await (const line of lines) {
        const value = door.parseJson(line);
        if (value && typeof value === 'object' && 'reason' in value && value.reason === 'compiler-artifact'
          && 'target' in value && value.target && typeof value.target === 'object'
          && 'name' in value.target && value.target.name === 'e2e-lots'
          && 'executable' in value && typeof value.executable === 'string') executable = value.executable;
      }
    })()]);
    if (!executable) throw new Error('Cargo did not report the Lots launcher artifact');
    return executable;
  } finally {
    clearTimeout(deadline);
    lines.close();
    if (child.exitCode === null && child.signalCode === null) child.kill();
  }
}

function completion(child: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise((resolve, reject) => {
    child.once('error', error => reject(new Error(`Lots launcher spawn failed: ${error.message}`)));
    child.once('close', (code, signal) => code === 0 ? resolve()
      : reject(new Error(`Lots launcher process exited (${code ?? signal})`)));
  });
}

function handoff(value: unknown): Handoff {
  if (!value || typeof value !== 'object' || Object.keys(value).sort().join(',') !== 'endpoint,overlay_origin,token'
    || !('endpoint' in value) || typeof value.endpoint !== 'string'
    || !('token' in value) || typeof value.token !== 'string' || !/^[a-f0-9]{64}$/.test(value.token)
    || !('overlay_origin' in value) || typeof value.overlay_origin !== 'string') {
    throw new Error('Invalid Lots launcher handoff');
  }
  const endpoint = new URL(value.endpoint);
  const overlay = new URL(value.overlay_origin);
  if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || !endpoint.port
    || endpoint.href !== `${endpoint.origin}/`
    || overlay.protocol !== 'http:' || overlay.hostname !== 'localhost' || !overlay.port
    || value.overlay_origin !== overlay.origin || overlay.port === endpoint.port) {
    throw new Error('Lots launcher must use separate ephemeral loopback origins');
  }
  return { endpoint: value.endpoint, token: value.token, overlay_origin: value.overlay_origin };
}

export async function startCore() {
  const executable = await buildCoreLauncher();
  const parent = join(repo, 'target');
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(join(parent, 'e2e-lots-'));
  let child: ChildProcessWithoutNullStreams | undefined;
  let closed: Promise<void> | undefined;
  const close = async () => {
    if (child) {
      child.stdin.end();
      if (child.exitCode === null && child.signalCode === null) child.kill();
      await closed;
    }
    // Only the exact mkdtemp result owned by this launch is removed.
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  };
  try {
    child = spawn(executable, [directory], { cwd: repo, windowsHide: true, stdio: 'pipe' });
    const running = child;
    closed = new Promise<void>(resolve => running.once('close', () => resolve()));
    // Drain, but never publish runtime diagnostics: they must not leak a capability.
    running.stderr.resume();
    const ready = await new Promise<Handoff>((resolve, reject) => {
      const lines = createInterface({ input: running.stdout });
      const timer = setTimeout(() => reject(new Error('Lots core startup timed out')), 30_000);
      const fail = () => reject(new Error('Lots core exited before its handoff'));
      const error = (cause: Error) => reject(new Error(`Lots core spawn failed: ${cause.message}`));
      running.once('error', error);
      running.once('exit', fail);
      lines.once('line', line => {
        try { resolve(handoff(door.parseJson(line, { max_bytes: 1024 }))); }
        catch { reject(new Error('Lots core returned an invalid handoff')); }
        finally {
          clearTimeout(timer); lines.close();
          running.off('error', error); running.off('exit', fail);
        }
      });
      running.once('close', () => { clearTimeout(timer); lines.close(); });
    });
    return {
      overlayOrigin: ready.overlay_origin,
      contract,
      invoke: <M extends keyof Methods>(method: MethodContract<M>, params: unknown) =>
        contract.invokeMethod(ready.endpoint, ready.token, method, contract.parseMethodParams(method, params)),
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
