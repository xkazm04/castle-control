import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vitest';
import { installFakeDom } from '../../fake-dom.js';
import { createCoreGatehousePort } from '../../gatehouse-core.js';
import type { GatehouseNetwork } from '../../gatehouse-core.js';
import { fixtureCharts, fixtureRules } from '../../moderation-fixture.js';
import { ConnectedGatehouse } from './core.jsx';
import { coreRuleBench } from './session.js';

// Counting spy on the bench evaluation (regex compile plus four text variants per message).
const spy = vi.hoisted(() => ({ evaluations: 0, seen: new Set<unknown>() }));
vi.mock('../../moderation-bench.js', async importOriginal => {
  const real = await importOriginal<typeof import('../../moderation-bench.js')>();
  return { ...real, evaluateDraft: (...args: Parameters<typeof real.evaluateDraft>) => {
    spy.evaluations += 1; spy.seen.add(args[2]); return real.evaluateDraft(...args);
  } };
});
afterEach(() => vi.restoreAllMocks());

// Generated data only, labelled simulated: 100 chat lines per page.
const stamp = '2026-10-28T12:00:00Z';
const page = {
  items: Array.from({ length: 100 }, (_, index) => ({ provenance: 'simulated',
    decision: { at: stamp, decision_id: `01ARZ3NDEKTSV4RRFFQ69G${String(index).padStart(4, '0')}`,
      message_id: `simulated-message-${index}`, kind: 'would_act', verdict: 'pass', operator: 'human', reason_codes: [] },
    message: { message_id: `simulated-message-${index}`, user_id: '123', at: stamp, text: `simulated chat line ${index}` } })),
  unavailable_count: 0, next_cursor: 'chat:100',
};

async function loadedPort(extra_pages: number) {
  const rpc = vi.fn<GatehouseNetwork['rpc']>(async (_endpoint, _session, method) => {
    if (method === 'gatehouse.rules.list') return structuredClone(fixtureRules);
    if (method === 'gatehouse.consensus.get') return structuredClone(fixtureCharts[0]);
    if (method === 'gatehouse.chat.list') return structuredClone(page);
    if (method === 'gatehouse.history.list') return { items: [], unavailable_count: 0 };
    throw new Error(`Unexpected method ${method}`);
  });
  const port = createCoreGatehousePort({ mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) }, { rpc });
  await port.load();
  for (let more = 0; more < extra_pages; more += 1) await port.moreChat();
  return port;
}

test('re-rendering the core room for unrelated reasons does not re-evaluate the accumulated chat', async () => {
  const port = await loadedPort(9);
  expect(port.getSnapshot().chat?.items).toHaveLength(1000);
  const { container, uninstall } = installFakeDom();
  try {
    const root = createRoot(container);
    const draw = (seal_slot: ReactNode) => act(async () => { root.render(<ConnectedGatehouse port={port} replay={false} seal_slot={seal_slot} />); });
    await draw('first');
    spy.evaluations = 0; spy.seen.clear();
    // Ten more renders: only the seal slot changes (as on every busy flip or notice).
    for (let tick = 0; tick < 10; tick += 1) await draw(`tick ${tick}`);
    // The rule bench child evaluates once per render on its own; the room must add none of its own.
    expect(spy.evaluations).toBe(10);
    expect(spy.seen.size).toBe(1);
    await act(async () => { root.unmount(); });
  } finally { uninstall(); }
});

test('a bench keystroke still re-evaluates the draft against the chat', async () => {
  const port = await loadedPort(1);
  const { container, uninstall } = installFakeDom();
  try {
    const root = createRoot(container);
    await act(async () => { root.render(<ConnectedGatehouse port={port} replay={false} />); });
    spy.evaluations = 0;
    await act(async () => { coreRuleBench(port).setDraft({ name: 'Simulated draft', pattern: 'simulated chat line 1', action: 'delete' }); });
    expect(spy.evaluations).toBeGreaterThanOrEqual(2);
    expect(container.textContent).toContain('simulated chat line 1');
    await act(async () => { root.unmount(); });
  } finally { uninstall(); }
});
