import { expect, test } from 'vitest';
import { HandoffError, parseHandoff } from './handoff.ts';

// SIMULATED capability: generated for this test, never a real session.
const token = 'ab'.repeat(32);
const good = { endpoint: 'http://127.0.0.1:41000/', token, overlay_origin: 'http://localhost:41001' };
const line = (value: unknown) => JSON.stringify(value);

function rejects(value: unknown) {
  let caught: unknown;
  try {
    parseHandoff(typeof value === 'string' ? value : line(value));
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(HandoffError);
  // A rejected line never comes back in the error, so its token cannot leak.
  expect(caught instanceof Error ? caught.message : '').not.toContain(token);
}

test('accepts the e2e-lots handoff shape', () => {
  expect(parseHandoff(line(good))).toEqual(good);
});

test('rejects a non-loopback or non-http endpoint', () => {
  for (const endpoint of ['http://0.0.0.0:41000/', 'http://localhost:41000/', 'http://192.168.1.4:41000/',
    'https://127.0.0.1:41000/', 'http://127.0.0.1/', 'http://127.0.0.1:41000/rpc', 'http://127.0.0.1:41000']) {
    rejects({ ...good, endpoint });
  }
});

test('rejects a bad token', () => {
  for (const bad of ['ab'.repeat(31), 'AB'.repeat(32), `${'ab'.repeat(31)}zz`, '', 7]) rejects({ ...good, token: bad });
});

test('rejects a shared, remote or non-origin overlay', () => {
  for (const overlay of ['http://localhost:41000', 'http://127.0.0.1:41001', 'http://evil.example:41001',
    'http://localhost:41001/', 'http://localhost', 'https://localhost:41001']) {
    rejects({ ...good, overlay_origin: overlay });
  }
});

test('rejects wrong keys, non-objects and non-JSON', () => {
  rejects({ ...good, extra: 1 });
  rejects({ endpoint: good.endpoint, token });
  rejects([good]);
  rejects(`${line(good)} trailing`);
  rejects(`not json ${token}`);
  rejects('x'.repeat(2048));
});
