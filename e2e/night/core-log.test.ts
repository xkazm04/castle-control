import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { PassThrough } from 'node:stream';
import { recordCoreStderr } from './core-log.ts';

async function directory() {
  const parent = resolve('target');
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, 'd5c-core-log-'));
  return { root, async dispose() {
    if (relative(parent, root).startsWith('..') || root === parent) throw new Error('Invalid test cleanup path');
    await rm(root, { recursive: true, force: true });
  } };
}
function child() {
  const events = new EventEmitter();
  const stderr = new PassThrough();
  const stdout = new PassThrough();
  return { pid: 123, stderr, stdout,
    once: (event: 'exit' | 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void) => { events.once(event, listener); },
    notify: (event: 'exit' | 'close', code: number | null, signal: NodeJS.Signals | null) => { events.emit(event, code, signal); },
  };
}
test('core log appends stderr and unexpected exit metadata; never consumes stdout handoffs', async () => {
  const dir = await directory();
  try {
    for (const signal of [null, 'SIGTERM'] as const) {
      let requested_stop = signal !== null;
      const process = child(); const log = recordCoreStderr(process, dir.root, () => requested_stop);
      process.stdout.write('SIMULATED-HANDOFF-MUST-NOT-APPEAR');
      process.stderr.write('generated SIMULATED core diagnostic\n');
      process.notify('exit', signal === null ? 17 : null, signal);
      // A finally block can request shutdown before stdio finishes closing.
      // The log must retain whether the original exit was unexpected.
      requested_stop = true;
      process.notify('close', signal === null ? 17 : null, signal);
      await log.closed; log.assertWritten();
    }
    const text = await readFile(join(dir.root, 'core-stderr.log'), 'utf8');
    assert.equal(text.split('generated SIMULATED core diagnostic').length - 1, 2);
    assert.match(text, /"event":"core-exit".*"code":17,"signal":null,"requested_stop":false/);
    assert.match(text, /"event":"core-exit".*"code":null,"signal":"SIGTERM","requested_stop":true/);
    assert.doesNotMatch(text, /HANDOFF/);
  } finally { await dir.dispose(); }
});
test('stderr stream errors remain reportable after the process closes', async () => {
  const dir = await directory();
  try {
    const process = child(); const log = recordCoreStderr(process, dir.root, () => false);
    process.stderr.emit('error', new Error('SIMULATED stderr read failure'));
    process.notify('exit', 1, null); process.notify('close', 1, null); await log.closed;
    assert.throws(log.assertWritten, /SIMULATED stderr read failure/);
  } finally { await dir.dispose(); }
});
