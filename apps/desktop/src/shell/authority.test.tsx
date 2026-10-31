import { Children, isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { invoke } from '@castle-control/contract';
import { ProposalCard, WindowedRows } from '@castle-control/ui';
import type { ProposalCardProps, WindowedRowsProps } from '@castle-control/ui';
import { LiveSteward, proposalQueue } from '@castle-control/ui/steward';
import type { Proposal, SealAuthority } from '@castle-control/ui/steward';
import { Inspector } from '../overview/inspector.jsx';
import { Overview } from '../overview/overview.jsx';
import { coreStewardConnection, createDesktopClient } from '../client.js';
import { simulatedRead } from '../simulated.js';
import { DesktopView } from '../view.jsx';
import Room from './room.jsx';
import { shellSealAuthority, shellStewardPort } from './core-steward.js';
import { StewardSealSlot } from './steward-slot.jsx';

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
function setup() {
  const synthetic = { ...writ, writ_id: `${writ.writ_id.slice(0, -1)}${++sequence}` };
  const transport = { ask: vi.fn(async () => JSON.stringify({ writ: synthetic })), seal: vi.fn(), tear: vi.fn() };
  const connection = { launch: { mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) } as const,
    live: true, reachable: () => true, transport };
  return { transport, connection };
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
