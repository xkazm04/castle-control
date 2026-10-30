import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chamberIds, counted, routeInventory, routes, source, tokenInventory } from './inventory.ts';
import { loopback } from './network.ts';
import { simulatedSnapshots, snapshotEvent, startOverlay, visualId } from './overlay-server.ts';

test('real navigation yields canonical routes including every chamber and nested drill', () => {
  const ids = chamberIds(source('packages/ui/src/shell.tsx'));
  assert.equal(routes.length, ids.length + 4);
  for (const id of ids) assert.ok(routes.includes(`#/chamber/${id}`));
  assert.ok(routes.includes('#/keep'));
  assert.ok(routes.includes('#/overview'));
  assert.ok(routes.includes('#/demo'));
  assert.ok(routes.includes('#/chamber/moderator/drill'));
  assert.ok(!routes.includes('#/moderator/drill'));
});

test('inventory follows new literal and templated canonical routes', () => {
  const navigation = 'export function canonicalHash(hash: string): string { if (hash === "#/new-surface") return hash; '
    + 'for (const { id } of chambers) if (hash === `#/chamber/${id}/new-detail`) return hash; return "#/home"; }';
  assert.deepEqual(routeInventory(navigation, ['simulated-room']), ['#/chamber/simulated-room/new-detail', '#/home', '#/new-surface']);
});

test('inventory refuses missing/empty/unsupported source instead of passing vacuously', () => {
  assert.throws(() => counted('seeded-empty', 0), /empty inventory/);
  assert.throws(() => chamberIds('export const chambers = []'), /empty inventory/);
  assert.throws(() => tokenInventory('body {}'), /empty inventory/);
  assert.throws(() => routeInventory('export const absent = true', ['simulated']), /canonicalHash/);
  assert.throws(() => routeInventory('export function canonicalHash(hash: string) { return hash; }', ['simulated']), /empty inventory/);
  assert.throws(() => routeInventory('export function canonicalHash() { return `#/chamber/${other}`; }', ['simulated']), /adapter/);
});

test('token names come from declarations, with duplicates collapsed', () => {
  assert.deepEqual(tokenInventory(':root { --simulated-ink: red; --simulated-paper: tan } [data-theme] { --simulated-ink: blue }'),
    ['--simulated-ink', '--simulated-paper']);
});

test('network policy rejects lookalike hosts, external HTTP and external sockets', () => {
  for (const host of ['127.0.0.1', 'localhost', '[::1]']) for (const protocol of ['http', 'https', 'ws', 'wss']) {
    assert.equal(loopback(`${protocol}://${host}:5173/fixture`), true);
  }
  for (const url of ['https://example.com', 'wss://example.com', 'http://localhost.example.com',
    'http://127.0.0.1.example.com', 'http://127.0.0.1@example.com', 'file:///fixture']) assert.equal(loopback(url), false);
});

test('overlay server serves actual assets and contract-parsed simulated SSE without native core', async () => {
  const snapshots = await simulatedSnapshots();
  assert.equal(snapshots.length, 2);
  const overlay = await startOverlay();
  try {
    const html = await fetch(`${overlay.url}/beacons/${visualId}`);
    assert.match(await html.text(), /src="\/bundle.js"/);
    const bundle = await fetch(`${overlay.url}/bundle.js`);
    assert.match(await bundle.text(), /Castle Control overlay source SHA-256/);
    const response = await fetch(`${overlay.url}/push/beacons?visual_id=${visualId}`);
    assert.equal(response.headers.get('content-type'), 'text/event-stream');
    const reader = response.body?.getReader();
    assert.ok(reader);
    const first = await reader.read();
    assert.ok(first.value);
    const frame = new TextDecoder().decode(first.value);
    assert.ok(frame.includes(`event: ${snapshotEvent}\ndata: ${snapshots[0]}\n\n`));
    assert.match(frame, /SIMULATED/);
    await reader.cancel();
    assert.equal(overlay.pushes(), 1);
    assert.equal((await fetch(`${overlay.url}/push/beacons?visual_id=wrong`)).status, 404);
  } finally { await overlay.close(); }
});
