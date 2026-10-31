import { Children, isValidElement } from 'react';
import * as React from 'react';
import type { ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { invoke } from '@castle-control/contract';
import { ProposalCard, WindowedRows } from '@castle-control/ui';
import type { ProposalCardProps, WindowedRowsProps } from '@castle-control/ui';
import { createSealAuthority, LiveSteward, proposalQueue, SimulatedSteward } from '@castle-control/ui/steward';
import type { Proposal, SealAuthority } from '@castle-control/ui/steward';
import { Inspector } from '../overview/inspector.jsx';
import { Overview } from '../overview/overview.jsx';
import { coreStewardConnection, createDesktopClient } from '../client.js';
import { simulatedRead } from '../simulated.js';
import { DesktopView } from '../view.jsx';
import Room from './room.jsx';
import { shellSealAuthority, shellStewardPort } from './core-steward.js';
import { StewardSealSlot } from './steward-slot.jsx';
import SealSlot, { sealRoomProposal } from '../rooms/seal-slot/index.jsx';

vi.mock('react', async importOriginal => ({ ...await importOriginal<typeof React>() }));

beforeEach(() => { for (const proposal of proposalQueue.pending()) proposalQueue.tearUp(proposal.id); proposalQueue.select(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const writ = { writ_id: '01ARZ3NDEKTSV4RRFFQ69G5FAV', chamber: 'beacons', status: 'proposed',
  created_at: '2026-10-27T00:00:00Z', updated_at: '2026-10-27T00:00:01Z',
  proposal: { method: 'beacons.visual.upsert', diff: { after: { visual: {
    visual_id: 'simulated-frame', name: 'Synthetic transport frame', curve: {
      ranges: [{ total: 0, intensity: 0 }, { total: 50, intensity: 1 }], decay: { kind: 'exponential', half_life_s: 300 },
    },
  } } } } };

let sequence = 0;
const syntheticWrit = () => ({ ...writ, writ_id: `${writ.writ_id.slice(0, -2)}${String(++sequence).padStart(2, '0')}` });
function setup() {
  const synthetic = syntheticWrit();
  const transport = { ask: vi.fn(async () => JSON.stringify({ writ: synthetic })), seal: vi.fn(), tear: vi.fn() };
  const connection = { launch: { mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) } as const,
    live: true, reachable: () => true, transport };
  return { transport, connection, synthetic };
}

function find<P>(node: ReactNode, predicate: (element: ReactElement<P>) => boolean): ReactElement<P> | undefined {
  let match: ReactElement<P> | undefined;
  Children.forEach(node, child => {
    if (!isValidElement<P & { children?: ReactNode }>(child) || match) return;
    match = predicate(child) ? child : find(child.props.children, predicate);
  });
  return match;
}

test('Inspector tear uses the owning authority and leaves a failed core tear pending', async () => {
  const { connection, transport } = setup();
  const port = shellStewardPort(connection);
  await port.ask('Synthetic frame', { surface: 'room', chamber: 'visuals' });
  const proposal = proposalQueue.pending('visuals')[0];
  if (!proposal) throw new Error('Missing live draft');
  transport.tear.mockRejectedValue(new Error('Synthetic failure'));
  const authority = shellSealAuthority(connection);
  const routed = vi.spyOn(authority, 'tear');
  const direct = vi.spyOn(proposalQueue, 'tearUp');
  let card: ProposalCardProps | undefined;
  function Probe() {
    const tree = Inspector({ selected: 'visuals', proposals: [proposal!], authority, active: false, on_open: vi.fn() });
    const rows = find<WindowedRowsProps<Proposal>>(tree, element => element.type === WindowedRows);
    const node = rows?.props.children(proposal!);
    if (isValidElement<ProposalCardProps>(node) && node.type === ProposalCard) card = node.props;
    return tree;
  }
  renderToStaticMarkup(<Probe />);
  if (!card) throw new Error('Missing Inspector ProposalCard');
  card.on_tear();
  await vi.waitFor(() => expect(transport.tear).toHaveBeenCalledExactlyOnceWith({ writ_id: proposal.id }));
  expect(routed).toHaveBeenCalledExactlyOnceWith(proposal);
  expect(direct).not.toHaveBeenCalled();
  expect(proposalQueue.pending('visuals')).toContain(proposal);
});

test('one core snapshot supplies the identical memoized authority to Overview and the room slot', async () => {
  const { connection, transport } = setup();
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => new Response(JSON.stringify(
    String(init?.body).includes('"status.get"') ? { ...simulatedRead(1).status, simulated: false } : { state: 'connected' }))));
  const network = { socket: vi.fn(() => ({ onopen: null, onmessage: null, onclose: null, onerror: null, close: vi.fn() })), rpc: invoke };
  const client = createDesktopClient({ ...connection.launch, steward: 'live' }, network, undefined, undefined, transport);
  const stop = client.start();
  try {
    await vi.waitFor(() => expect(client.getSnapshot().phase).toBe('ready'));
    const snapshot = client.getSnapshot();
    const actual = coreStewardConnection(snapshot);
    if (!actual) throw new Error('Missing core connection');
    const authority = shellSealAuthority(actual);
    expect(shellSealAuthority(actual)).toBe(authority);
    let received: SealAuthority | undefined;
    function Probe() {
      const view = DesktopView({ snapshot, navigation: { current: 'overview', origin: 'keep', replay: false },
        theme: 'paper', on_navigate: vi.fn(), on_theme_change: vi.fn() });
      const overview = find<Parameters<typeof Overview>[0]>(view, element => 'selected' in element.props && 'snapshot' in element.props);
      expect(overview?.props.connection).toBe(actual);
      if (!overview) throw new Error('Missing Overview');
      const tree = Overview(overview.props);
      received = find<Parameters<typeof Inspector>[0]>(tree, element => element.type === Inspector)?.props.authority;
      return null;
    }
    renderToStaticMarkup(<Probe />);
    expect(received).toBe(authority);
    const room = Room({ chamber: 'visuals', replay: false, snapshot, origin: 'overview', connection: actual,
      on_open: vi.fn(), on_back: vi.fn() });
    const content = find<{ seal_slot: ReactElement<{ authority: SealAuthority }> }>(room, element => 'seal_slot' in element.props);
    expect(content?.props.seal_slot.type).toBe(StewardSealSlot);
    expect(content?.props.seal_slot.props.authority).toBe(authority);
  } finally { stop(); }
});

test.each([true, false])('a disconnected connection retains live ownership, including first authority creation after disconnect: %s', async established => {
  const { connection, transport } = setup();
  let reachable = true;
  connection.reachable = () => reachable;
  const port = shellStewardPort(connection);
  expect(port).toBeInstanceOf(LiveSteward);
  await port.ask('Synthetic frame', { surface: 'room', chamber: 'visuals' });
  const proposal = proposalQueue.pending('visuals')[0];
  if (!proposal) throw new Error('Missing live draft');
  const before = established ? shellSealAuthority(connection) : undefined;
  reachable = false;
  const authority = shellSealAuthority(connection);
  if (before) expect(authority).toBe(before);
  expect(shellSealAuthority(connection)).toBe(authority);
  expect(authority.owner(proposal)).toBe('live');
  expect((await authority.seal(proposal)).ok).toBe(false);
  expect(proposalQueue.pending('visuals')).toContain(proposal);
  expect(transport.seal).not.toHaveBeenCalled();
});

// Keep the slot's state across static renders, without mounting a DOM or changing leaf components.
function slotHarness(slot: () => ReactElement) {
  const cells: unknown[] = [];
  return () => {
    let cursor = 0;
    let tree: ReactElement | undefined;
    const state = vi.spyOn(React, 'useState').mockImplementation((<T,>(initial: T | (() => T)) => {
      const index = cursor++;
      if (!(index in cells)) cells[index] = typeof initial === 'function' ? (initial as () => T)() : initial;
      return [cells[index] as T, (next: React.SetStateAction<T>) => {
        cells[index] = typeof next === 'function' ? (next as (value: T) => T)(cells[index] as T) : next;
      }];
    }) as typeof React.useState);
    try {
      function Probe() { tree = slot(); return null; }
      renderToStaticMarkup(<Probe />);
    } finally { state.mockRestore(); }
    if (!tree) throw new Error('Missing slot tree');
    return { html: renderToStaticMarkup(tree), card: find<ProposalCardProps>(tree, element => element.type === ProposalCard)?.props };
  };
}

test('the live seal slot renders SEAL OUTCOME UNKNOWN and no enabled Hold to seal or Tear it up for an uncertain writ', async () => {
  const { connection, transport } = setup();
  const port = shellStewardPort(connection);
  if (!(port instanceof LiveSteward)) throw new Error('Missing live port');
  const draft = (await port.ask('Synthetic frame', { surface: 'room', chamber: 'visuals' })).proposals[0];
  if (!draft) throw new Error('Missing live draft');
  transport.seal.mockRejectedValue(new Error('Synthetic timeout'));
  await port.seal(draft.id);
  const html = renderToStaticMarkup(<StewardSealSlot chamber="visuals" port={port} />);
  expect(html).toContain('SEAL OUTCOME UNKNOWN');
  expect(html).toContain('check the core before acting');
  expect(html).not.toMatch(/Hold to (seal|proclaim)|Tear it up|AWAITING YOUR SEAL/);
});

test.each(['seal', 'tear'] as const)('fixture seal slot shows a status line after a successful local %s', async operation => {
  const draft = (await new SimulatedSteward().ask('draft a question draw', { surface: 'overview' })).proposals[0];
  if (!draft) throw new Error('Missing fixture proposal');
  const render = slotHarness(() => SealSlot({ chamber: 'lottery' }));
  const card = render().card;
  if (!card) throw new Error('Missing fixture card');
  if (operation === 'seal') card.on_seal(); else card.on_tear();
  await vi.waitFor(() => expect(proposalQueue.pending('lottery')).toHaveLength(0));
  const html = render().html;
  expect(html).toContain(`<p role="status">${operation === 'seal' ? 'Sealed.' : 'Torn up. This proposal will not act.'}</p>`);
  expect(html).not.toContain('role="alert"');
});

test('live seal slot renders a refused seal reply with role=alert, not role=status', async () => {
  const { connection, transport } = setup();
  const port = shellStewardPort(connection);
  if (!(port instanceof LiveSteward)) throw new Error('Missing live port');
  await port.ask('Synthetic frame', { surface: 'room', chamber: 'visuals' });
  transport.seal.mockRejectedValue(new Error('Synthetic timeout'));
  const render = slotHarness(() => StewardSealSlot({ chamber: 'visuals', port }));
  const card = render().card;
  if (!card) throw new Error('Missing live card');
  card.on_seal();
  await vi.waitFor(() => expect(render().html).toContain('<p role="alert">The Steward could not confirm the seal.'));
  expect(render().html).not.toContain('role="status"');
});

test.each(['live', 'fixture'] as const)('the %s slot clears its previous outcome when a new proposal arrives', async mode => {
  const port = mode === 'live' ? new LiveSteward({
    ask: vi.fn(async () => JSON.stringify({ writ: syntheticWrit() })),
    seal: vi.fn(), tear: vi.fn(),
  }) : new SimulatedSteward();
  const context = { surface: 'room', chamber: 'visuals' } as const;
  await port.ask(mode === 'live' ? 'Synthetic frame' : 'test fire 50 gifts', context);
  const authority = createSealAuthority({ queue: proposalQueue,
    ...(port instanceof LiveSteward ? { live: port } : {}), local: sealRoomProposal });
  vi.spyOn(authority, 'seal').mockResolvedValue({ ok: false, reply: 'Synthetic refusal' });
  const render = slotHarness(() => port instanceof LiveSteward
    ? StewardSealSlot({ chamber: 'visuals', port, authority }) : SealSlot({ chamber: 'visuals', authority }));
  const card = render().card;
  if (!card) throw new Error('Missing proposal');
  card.on_seal();
  await vi.waitFor(() => expect(render().html).toContain('Synthetic refusal'));
  await port.ask(mode === 'live' ? 'Another synthetic frame' : 'test fire 50 gifts', context);
  expect(proposalQueue.pending('visuals')).toHaveLength(2);
  expect(render().html).not.toContain('Synthetic refusal');
  // Returning to the old proposal set must not resurrect a cleared refusal.
  const newest = proposalQueue.pending('visuals').at(-1);
  if (!newest) throw new Error('Missing new proposal');
  proposalQueue.tearUp(newest.id);
  expect(render().html).not.toContain('Synthetic refusal');
});

test.each(['seal', 'tear'] as const)('live seal slot announces a confirmed %s as status', async operation => {
  const { connection, transport, synthetic } = setup();
  const port = shellStewardPort(connection);
  if (!(port instanceof LiveSteward)) throw new Error('Missing live port');
  await port.ask('Synthetic frame', { surface: 'room', chamber: 'visuals' });
  transport[operation].mockResolvedValue(JSON.stringify({ writ: { ...synthetic, status: operation === 'seal' ? 'sealed' : 'torn' } }));
  const render = slotHarness(() => StewardSealSlot({ chamber: 'visuals', port }));
  const card = render().card;
  if (!card) throw new Error('Missing live card');
  if (operation === 'seal') card.on_seal(); else card.on_tear();
  await vi.waitFor(() => expect(proposalQueue.pending('visuals')).toHaveLength(0));
  expect(render().html).toContain(`<p role="status">${operation === 'seal'
    ? 'The core confirmed your sealed configuration.' : 'Torn up. This proposal will not act.'}</p>`);
  expect(render().html).not.toContain('role="alert"');
});

test('fixture seal slot announces a guardrail refusal as alert', async () => {
  const steward = new SimulatedSteward();
  await steward.ask('draft a question draw', { surface: 'overview' });
  await steward.ask('prize is a signed print', { surface: 'overview' });
  const render = slotHarness(() => SealSlot({ chamber: 'lottery' }));
  const card = render().card;
  if (!card) throw new Error('Missing fixture card');
  card.on_seal();
  await vi.waitFor(() => expect(render().html).toContain('<p role="alert">Giveaway guardrails block this roll.</p>'));
  expect(proposalQueue.pending('lottery')).toHaveLength(1);
  expect(render().html).not.toContain('role="status"');
});
