import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { parseJson } from '@castle-control/contract/door';
import { parseHandoff, type Handoff } from './handoff.ts';
import { openSession, type Session } from './session.ts';
import type { StreamOptions } from './streams.ts';

export type StartOptions = {
  /** Launcher executable; otherwise env CC_HEADLESS_EXE, otherwise a cargo build. */
  exe?: string;
  /** Arguments placed before the data root (e.g. a script when exe is an interpreter). */
  launcherArgs?: readonly string[];
  /** Kept on close. Without it a fresh temp directory is created and removed on close. */
  dataRoot?: string;
  /** Where cargo build diagnostics go (no capability exists during a build). */
  diagnostics?: (text: string) => void;
  startupTimeoutMs?: number;
  stream?: StreamOptions;
};

/** The core could not be built, spawned or handed off. Messages never carry the token. */
export class CoreLaunchError extends Error {}

const REPO = fileURLToPath(new URL('../../../', import.meta.url));

function exited(child: ChildProcessWithoutNullStreams): Promise<number | null> {
  return new Promise(done => {
    if (child.exitCode !== null || child.signalCode !== null) done(child.exitCode);
    else child.once('close', code => done(code));
  });
}

/** Build cc-headless and read the executable from cargo's compiler-artifact message. */
export async function buildLauncher(diagnostics: (text: string) => void): Promise<string> {
  const child = spawn('cargo', ['build', '--locked', '-p', 'cc-core', '--bin', 'cc-headless',
    '--message-format=json-render-diagnostics'], { cwd: REPO, windowsHide: true, stdio: 'pipe' });
  const failed = new Promise<never>((_, reject) => child.once('error', error =>
    reject(new CoreLaunchError(`cargo could not start: ${error.message}`))));
  child.stderr.on('data', (bytes: Buffer) => diagnostics(bytes.toString('utf8')));
  let executable: string | undefined;
  const lines = createInterface({ input: child.stdout });
  const read = (async () => {
    for await (const line of lines) {
      let value: unknown;
      try {
        value = parseJson(line);
      } catch {
        continue;
      }
      if (value && typeof value === 'object' && 'reason' in value && value.reason === 'compiler-artifact'
        && 'target' in value && value.target && typeof value.target === 'object'
        && 'name' in value.target && value.target.name === 'cc-headless'
        && 'executable' in value && typeof value.executable === 'string') executable = value.executable;
    }
  })();
  const code = await Promise.race([Promise.all([read, exited(child)]).then(([, code]) => code), failed]);
  if (code !== 0) throw new CoreLaunchError(`cargo build of cc-headless failed (${code})`);
  if (!executable) throw new CoreLaunchError('cargo did not report the cc-headless executable');
  return executable;
}

async function waitForHandoff(child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<Handoff> {
  const lines = createInterface({ input: child.stdout });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<Handoff>((resolve, reject) => {
      timer = setTimeout(() => reject(new CoreLaunchError('headless core startup timed out')), timeoutMs);
      child.once('error', error => reject(new CoreLaunchError(`headless core spawn failed: ${error.message}`)));
      child.once('exit', code => reject(new CoreLaunchError(`headless core exited before its handoff (${code})`)));
      lines.once('line', line => {
        try {
          resolve(parseHandoff(line));
        } catch {
          reject(new CoreLaunchError('headless core returned an invalid handoff'));
        }
      });
    });
  } finally {
    clearTimeout(timer);
    lines.close();
    // Anything after the handoff is drained and dropped, never forwarded.
    child.stdout.resume();
  }
}

/**
 * Spawn a rehearsal-only headless core on an isolated data root. The core's
 * stdout (which carries the token) and stderr are never forwarded anywhere.
 * Closing the session closes the core's stdin, which stops it.
 */
export async function startCore(options: StartOptions = {}): Promise<Session> {
  const diagnostics = options.diagnostics ?? ((text: string) => { process.stderr.write(text); });
  const exe = options.exe ?? process.env.CC_HEADLESS_EXE ?? await buildLauncher(diagnostics);
  const owned = options.dataRoot === undefined;
  let root: string;
  if (options.dataRoot === undefined) root = await mkdtemp(resolve(tmpdir(), 'cc-headless-'));
  else {
    root = resolve(options.dataRoot);
    await mkdir(root, { recursive: true });
  }
  let child: ChildProcessWithoutNullStreams | undefined;
  const stop = async () => {
    if (child?.pid !== undefined) {
      const running = child;
      const done = exited(running);
      running.stdin.end();
      const timer = setTimeout(() => running.kill(), 5000);
      await done;
      clearTimeout(timer);
    }
    // Only this launch's own mkdtemp result is ever removed.
    if (owned) await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  };
  try {
    child = spawn(exe, [...(options.launcherArgs ?? []), root], { windowsHide: true, stdio: 'pipe' });
    child.stderr.resume();
    child.stdin.on('error', () => { /* The core may already be gone; close() still awaits its exit. */ });
    const handoff = await waitForHandoff(child, options.startupTimeoutMs ?? 30_000);
    const session: { onClose: () => Promise<void>; stream?: StreamOptions } = { onClose: stop };
    if (options.stream) session.stream = options.stream;
    return openSession(handoff, session);
  } catch (error) {
    await stop();
    if (error instanceof CoreLaunchError) throw error;
    throw new CoreLaunchError(`headless core launch failed: ${error instanceof Error ? error.message : 'unknown'}`);
  }
}
