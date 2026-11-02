// Subprocess helpers for the one-time headless lane: the `cc` CLI and the
// `cc-mcp` stdio server, each on plain Node with CC_HEADLESS_EXE set so neither
// triggers cargo. Captured output stays in memory; it is checked for a 64-hex
// capability and never written to disk.
import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { repo } from '../inventory.ts';

type JsonDoor = typeof import('../../packages/contract/src/door.mjs');
const door: JsonDoor = await import(new URL('../../packages/contract/src/door.mjs', import.meta.url).href);

export const CC = join(repo, 'packages', 'headless', 'src', 'cc.mjs');
export const CC_MCP = join(repo, 'packages', 'headless', 'src', 'cc-mcp.mjs');
/** A session capability is 64 lowercase hex; none may appear in captured output. */
export const CAPABILITY = /[a-f0-9]{64}/i;

/** Parse one NDJSON/JSON-RPC line through the contract's JSON door. */
export function line(text: string): unknown {
  return door.parseJson(text, { max_bytes: 1 << 20 });
}

/** Read a string-keyed field of a parsed JSON object, or undefined. */
export function field(value: unknown, key: string): unknown {
  return value && typeof value === 'object' && !Array.isArray(value) && key in value
    ? (value as Record<string, unknown>)[key] : undefined;
}

/** The child environment: the prebuilt launcher, and no live opt-ins. */
export function childEnv(exe: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, CC_HEADLESS_EXE: exe };
  for (const key of ['CC_LIVE_TWITCH', 'CC_LIVE_OBS', 'CC_LIVE_FLOOR']) delete env[key];
  return env;
}

export type Finished = { code: number | null; stdout: string; stderr: string; ms: number };

/** Run a node script to completion with `input` on stdin, killing it after `timeoutMs`. */
export function runNode(script: string, args: readonly string[], input: string, exe: string, timeoutMs = 60_000):
  Promise<Finished> {
  const started = Date.now();
  const child = spawn(process.execPath, [script, ...args], { cwd: repo, windowsHide: true, stdio: 'pipe', env: childEnv(exe) });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (bytes: Buffer) => { stdout += bytes.toString('utf8'); });
  child.stderr.on('data', (bytes: Buffer) => { stderr += bytes.toString('utf8'); });
  child.stdin.end(input);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error(`${script} timed out after ${timeoutMs} ms`)); }, timeoutMs);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr, ms: Date.now() - started }); });
  });
}

/** A line-oriented JSON-RPC peer over a child's stdio, answering requests by id. */
export function mcpClient(exe: string) {
  const child: ChildProcessWithoutNullStreams = spawn(process.execPath, [CC_MCP],
    { cwd: repo, windowsHide: true, stdio: 'pipe', env: childEnv(exe) });
  let stdout = '';
  let stderr = '';
  const waiting = new Map<number, (frame: unknown) => void>();
  child.stderr.on('data', (bytes: Buffer) => { stderr += bytes.toString('utf8'); });
  const closed = new Promise<number | null>(resolve => child.once('close', code => resolve(code)));
  const lines = createInterface({ input: child.stdout });
  lines.on('line', text => {
    stdout += `${text}\n`;
    const frame = line(text);
    const id = field(frame, 'id');
    if (typeof id === 'number') waiting.get(id)?.(frame);
  });
  return {
    request(id: number, method: string, params: unknown, timeoutMs = 60_000): Promise<unknown> {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`MCP ${method} timed out`)), timeoutMs);
        waiting.set(id, frame => { clearTimeout(timer); waiting.delete(id); resolve(frame); });
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      });
    },
    notify(method: string) { child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method })}\n`); },
    /** Close stdin and wait at most `timeoutMs` for the exit code; kill on timeout. */
    async end(timeoutMs: number): Promise<{ code: number | null; ms: number }> {
      const started = Date.now();
      child.stdin.end();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<'late'>(resolve => { timer = setTimeout(() => resolve('late'), timeoutMs); });
      const code = await Promise.race([closed, late]);
      clearTimeout(timer);
      if (code === 'late') { child.kill(); await closed; throw new Error(`cc-mcp did not exit within ${timeoutMs} ms`); }
      return { code, ms: Date.now() - started };
    },
    output: () => ({ stdout, stderr }),
  };
}

/** The `cc-headless-*` temp roots that exist now (startCore makes one per launch). */
export async function headlessRoots(): Promise<Set<string>> {
  return new Set((await readdir(tmpdir())).filter(name => name.startsWith('cc-headless-')).map(name => join(tmpdir(), name)));
}
