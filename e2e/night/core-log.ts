import { closeSync, mkdirSync, openSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Readable } from 'node:stream';

type CoreChild = {
  pid?: number | undefined; stderr: Readable;
  once: (event: 'exit' | 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void) => void;
};

/** stdout is deliberately absent: the launch capability can never enter this log. */
export function recordCoreStderr(child: CoreChild, directory: string, requested_stop: () => boolean) {
  mkdirSync(directory, { recursive: true });
  const file = openSync(join(directory, 'core-stderr.log'), 'a');
  let failure: unknown;
  const capture = (error: unknown) => { failure ??= error; };
  const write = (bytes: string | Uint8Array) => {
    try { writeFileSync(file, bytes); } catch (error: unknown) { capture(error); }
  };
  const record = (event: string, fields: Record<string, unknown> = {}) => write(`${JSON.stringify({
    event, at: new Date().toISOString(), pid: child.pid, ...fields,
  })}\n`);
  record('core-start');
  child.stderr.on('data', write);
  child.stderr.once('error', capture);
  child.once('exit', (code, signal) => {
    record('core-exit', { code, signal, requested_stop: requested_stop() });
  });
  const closed = new Promise<void>(resolve => child.once('close', () => {
    child.stderr.removeListener('data', write);
    child.stderr.removeListener('error', capture);
    try { closeSync(file); } catch (error: unknown) { capture(error); }
    resolve();
  }));
  return { closed, assertWritten() { if (failure !== undefined) throw failure; } };
}
