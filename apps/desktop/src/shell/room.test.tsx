import { Children, isValidElement } from 'react';
import { readFileSync } from 'node:fs';
import type { ButtonHTMLAttributes, KeyboardEvent, ReactElement, ReactNode } from 'react';
import { renderToReadableStream, renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { ProposalCard, SealButton, sealHoldDurationMs } from '@castle-control/ui';
import { ProposalQueue, SimulatedSteward } from '@castle-control/ui/steward';
import SealSlot, { sealRoomProposal } from '../rooms/seal-slot/index.jsx';
import { draftRoll } from '../rooms/lottery/session.js';
import { coreGatehouseConnection, coreLotsConnection, createDesktopClient } from '../client.js';
import { fixtureCharts, fixtureRules } from '../moderation-fixture.js';
import { fixtureDraws } from '../lots-fixture.js';
import { backHash, dispatchShortcut, initialNavigation, navigateHash } from '../navigation.js';
import Room from './room.jsx';

test('all room headers hold the display title, plain subtitle, locator and origin Back link', async () => {
  for (const [chamber, title, description] of [
    ['lottery', 'The Lot Chamber', 'Lottery manager'], ['moderator', 'The Gatehouse', 'AI moderator'],
    ['visuals', 'The Beacons', 'Contribution visuals'], ['studio', 'The Map Room', 'Extension studio'],
  ] as const) {
    const stream = await renderToReadableStream(<Room chamber={chamber} replay={false}
      snapshot={{ mode: 'fixture', phase: 'ready' }} origin="overview" on_open={vi.fn()} on_back={vi.fn()} />);
    await stream.allReady;
    const markup = await new Response(stream).text();
    const header = markup.match(/<header class="shell-room-header"[\s\S]*?<\/header>/)?.[0]?.replace(/<!--.*?-->/g, '') ?? '';
    expect(header).toContain(`<h1>${title}</h1>`);
    expect(header).toContain(description);
    expect(header).toContain('Chamber locator');
    expect(header).toContain('Back to the overview');
    expect(header).toContain('href="#/overview"');
    expect(markup).toContain('SIMULATED');
    const column = chamber === 'lottery' ? 'lottery-details' : chamber === 'moderator' ? 'moderator-details'
      : chamber === 'visuals' ? 'visuals-room-details' : 'studio-room-details';
    expect(markup.indexOf(column)).toBeGreaterThan(0);
    expect(markup.indexOf('aria-label="Seal slot"')).toBeGreaterThan(markup.indexOf(column));
    expect(markup).toMatch(/<aside class="shell-seal-slot"[\s\S]*?<\/aside><\/div><\/div>/);
  }
  const style = readFileSync(new URL('./room.css', import.meta.url), 'utf8');
  expect(style).toMatch(/\.shell-room-header h1\s*\{[^}]*var\(--font-display\)/);
  expect(style).toMatch(/\.shell-room \.shell-room-work\s*\{[^}]*display:\s*block/);
  expect(style).toMatch(/\.shell-room \.shell-seal-slot\s*\{[^}]*border-top:/);
});

test('room stages retain token insets and model states use the existing accent fills', () => {
  const shell = readFileSync(new URL('./room.css', import.meta.url), 'utf8');
  expect(shell).toMatch(/\.room-stage\s*\{[^}]*padding:\s*var\(--space-16\)/);
  expect(shell).toMatch(/\.room-column\s*\{[^}]*padding:\s*var\(--space-16\)/);
  const studio = readFileSync(new URL('../rooms/studio/room.css', import.meta.url), 'utf8');
  expect(studio).toMatch(/\.studio-room-workbench\s*\{[^}]*padding:\s*var\(--space-16\)/);
  expect(studio).toMatch(/button\[data-current="true"\][^}]*background:\s*var\(--ink\)/);
  const moderator = readFileSync(new URL('../rooms/moderator/room.css', import.meta.url), 'utf8');
  expect(moderator).toMatch(/i\[data-on="true"\][^}]*background:\s*var\(--azure\)/);
  const lottery = readFileSync(new URL('../rooms/lottery/room.css', import.meta.url), 'utf8');
  expect(lottery).toMatch(/button\[data-active="true"\][^}]*border-color:\s*var\(--gules\)/);
});

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const fixture = { mode: 'fixture', phase: 'ready' } as const;

test.each([
  ['lottery', 'Draw shapes'], ['moderator', 'Chat overlay and vote bar'],
  ['visuals', 'Beacon visuals'], ['studio', 'War-table panel'],
] as const)('%s room exposes native, tabbable design actions in its seal slot', async (chamber, label) => {
  const stream = await renderToReadableStream(<Room chamber={chamber} replay={false} snapshot={fixture}
    origin="overview" on_open={vi.fn()} on_back={vi.fn()} />);
  await stream.allReady;
  const markup = await new Response(stream).text();
  const slot = markup.slice(markup.indexOf('aria-label="Seal slot"'));
  expect(slot).toContain(`aria-label="${label} design"`);
  expect(slot).toContain('>Restyle</button>');
  expect(slot).toContain('>Custom design</button>');
  expect(slot).toContain('SIMULATED');
  expect(slot).not.toContain('tabindex="-1"');
});

test('the portcullis heading uses the room caption scale so the held message dominates', () => {
  const controls = readFileSync(new URL('../rooms/moderator/controls.tsx', import.meta.url), 'utf8');
  expect(controls).toContain('<h2 className="room-caption">');
  const css = readFileSync(new URL('../rooms/moderator/room.css', import.meta.url), 'utf8');
  const heading = css.match(/\.moderator-portcullis h2\s*\{[^}]*\}/)?.[0] ?? '';
  expect(heading).not.toContain('--text-chamber-number');
  expect(heading).toContain('var(--text-label)');
});
test('polished rooms render each stage title once and expose keyboard scroll regions', async () => {
  for (const [chamber, title] of [['lottery', 'The urn'], ['moderator', 'At the portcullis'], ['studio', 'The war table']] as const) {
    const stream = await renderToReadableStream(<Room chamber={chamber} replay={false} snapshot={fixture}
      origin="keep" on_open={vi.fn()} on_back={vi.fn()} />);
    await stream.allReady;
    const markup = (await new Response(stream).text()).replace(/<!--.*?-->/g, '');
    expect(markup.match(new RegExp(`>${title}(?: ·|<)`, 'g'))).toHaveLength(1);
    if (chamber === 'lottery') {
      expect(markup).toContain('Giveaway guardrails · OK');
      expect(markup).not.toContain('Past writs');
      expect(markup).not.toContain('aria-label="Giveaway guardrails · local preview"');
    } else {
      expect(markup).toContain('class="room-scroll-hint"');
      expect(markup).toContain('tabindex="0"');
      expect(markup).toContain(chamber === 'moderator' ? 'aria-describedby="moderator-scroll-hint"' : 'aria-describedby="studio-scroll-hint"');
    }
    if (chamber === 'moderator') {
      const details = markup.slice(markup.indexOf('moderator-details'));
      expect(details).toContain('moderator-messages moderator-card');
      expect(details).toContain('Garrison orders');
      expect(details).toContain('Now: 420 lines');
      expect(details).toContain('Now: 0 Armed · 3 Watching');
      expect(markup).toContain('Simulated original message: simulated-blocked, quoted for human review.');
    }
  }
});

test('review and map scroll affordances remain visible without hiding content at desktop sizes', () => {
  for (const path of ['../rooms/moderator/room.css', '../rooms/studio/room.css']) {
    const css = readFileSync(new URL(path, import.meta.url), 'utf8');
    expect(css).toContain('scrollbar-gutter: stable');
    expect(css).toContain('overflow-y: scroll');
  }
  const css = readFileSync(new URL('./room.css', import.meta.url), 'utf8');
  expect(css).toMatch(/\.room-scroll-hint\s*\{[^}]*font:[^}]*var\(--text-label\)/);
});

const pending = (queue: ProposalQueue) => {
  const proposal = queue.pending().at(-1);
  if (!proposal) throw new Error('Missing proposal');
  return proposal;
};
function tearButton(tree: ReactNode): ButtonHTMLAttributes<HTMLButtonElement> {
  let button: ButtonHTMLAttributes<HTMLButtonElement> | undefined;
  const visit = (node: ReactNode) => Children.forEach(node, child => {
    if (!isValidElement<ButtonHTMLAttributes<HTMLButtonElement> & { 'data-tear-proposal'?: boolean }>(child)) return;
    if (child.props['data-tear-proposal']) button = child.props;
    else visit(child.props.children);
  });
  visit(tree);
  if (!button) throw new Error('Tear button missing');
  return button;
}

/** Capture the kit's real native handlers while its hooks run under React's server
 * renderer. No DOM shim or private package import replaces the hold control. */
function nativeSeal(on_seal: () => void): ButtonHTMLAttributes<HTMLButtonElement> {
  let props: ButtonHTMLAttributes<HTMLButtonElement> | undefined;
  function Probe() {
    const control = SealButton({ on_seal }) as ReactElement<Record<string, unknown>,
      (props: Record<string, unknown>) => ReactElement<ButtonHTMLAttributes<HTMLButtonElement>>>;
    const button = control.type(control.props);
    props = button.props;
    return button;
  }
  renderToStaticMarkup(<Probe />);
  if (!props) throw new Error('Seal control missing');
  return props;
}
const space = (key = ' ') => Object.assign({} as KeyboardEvent<HTMLButtonElement>,
  { key, repeat: false, preventDefault: vi.fn(), nativeEvent: { isComposing: false } });

test.each(['keep', 'overview'] as const)('room keys 1-4 and Escape retain the %s origin, including drill', origin => {
  let navigation = initialNavigation(`#/${origin}`);
  for (const [number, chamber] of [['1', 'lottery'], ['2', 'moderator'], ['3', 'visuals'], ['4', 'studio']]) {
    dispatchShortcut({ key: number ?? '', preventDefault: vi.fn() }, false,
      id => { navigation = navigateHash(navigation, `#/chamber/${id}`); }, vi.fn());
    expect(navigation.current).toBe(chamber);
    expect(navigation.origin).toBe(origin);
  }
  navigation = navigateHash(navigation, '#/chamber/moderator/drill');
  expect(navigation.replay).toBe(true);
  dispatchShortcut({ key: 'Escape', preventDefault: vi.fn() }, false, vi.fn(), vi.fn(),
    { back: () => { navigation = navigateHash(navigation, backHash(navigation)); } });
  expect(navigation.current).toBe(origin);
});

test('the focused root and tear button support Delete; unrelated keys and editable Delete cannot tear', () => {
  const queue = new ProposalQueue(); draftRoll(queue);
  const proposal = pending(queue);
  const seal = vi.fn();
  const tree = ProposalCard({ proposal, focused: true, on_seal: seal, on_tear: () => queue.tearUp(proposal.id) });
  expect(tree.props['data-proposal-focused']).toBe(true);
  const button = tearButton(tree);
  const tear = () => button.onClick?.({} as Parameters<NonNullable<typeof button.onClick>>[0]);
  expect(renderToStaticMarkup(tree)).toContain('data-tear-proposal="true"');
  expect(queue.pending()).toHaveLength(1);
  for (const key of ['Enter', ' ', 'a']) dispatchShortcut({ key, preventDefault: vi.fn() }, false, vi.fn(), vi.fn(), { tear });
  dispatchShortcut({ key: 'Delete', preventDefault: vi.fn() }, true, vi.fn(), vi.fn(), { tear });
  expect(queue.pending()).toHaveLength(1); expect(seal).not.toHaveBeenCalled();
  dispatchShortcut({ key: 'Delete', preventDefault: vi.fn() }, false, vi.fn(), vi.fn(), { tear });
  expect(queue.byChamber('lottery')[0]?.state).toBe('torn');
  expect(seal).not.toHaveBeenCalled();
});

test('the real focused SealButton requires continuous held Space and stamps only after its deadline', async () => {
  vi.useFakeTimers(); const queue = new ProposalQueue(); draftRoll(queue);
  let completion: Promise<void> | undefined;
  const button = nativeSeal(() => { completion = sealRoomProposal(queue, pending(queue)); });
  expect(button.onClick).toBeUndefined();
  button.onKeyDown?.(space('Enter')); vi.advanceTimersByTime(sealHoldDurationMs);
  expect(queue.pending()).toHaveLength(1);
  button.onKeyDown?.(space()); vi.advanceTimersByTime(sealHoldDurationMs - 1);
  button.onKeyUp?.(space()); vi.advanceTimersByTime(sealHoldDurationMs);
  expect(completion).toBeUndefined(); expect(queue.pending()).toHaveLength(1);
  button.onKeyDown?.(space()); vi.advanceTimersByTime(sealHoldDurationMs);
  await completion;
  expect(queue.byChamber('lottery')[0]?.state).toBe('sealed');
  expect(queue.byChamber('lottery')[0]?.seal_hash).toMatch(/^[a-f0-9]{64}$/);
  button.onKeyUp?.(space());
});

test('all chambers read the same queue, display their fields, and proclaim only via the hold path', async () => {
  const queue = new ProposalQueue(); const steward = new SimulatedSteward(queue);
  await steward.ask('draft a question draw', { surface: 'room' });
  await steward.ask('raise the drawbridge', { surface: 'room' });
  await steward.ask('test fire 50 gifts', { surface: 'room' });
  await steward.ask('what should the next turn be', { surface: 'room' });
  for (const chamber of ['lottery', 'moderator', 'visuals', 'studio'] as const) {
    const markup = renderToStaticMarkup(<SealSlot chamber={chamber} queue={queue} />);
    expect(markup).toContain('Proposal · awaiting your seal');
    expect(markup).toContain('cc-proposal-card');
    expect(markup).not.toContain('Simulated changes only.');
    expect(markup).toContain('Tear it up');
    expect(markup).toContain(chamber === 'visuals' || chamber === 'studio' ? 'Hold to seal and proclaim' : 'Hold to seal');
    expect(queue.pending(chamber)).toHaveLength(1);
  }
  const proposal = queue.pending('visuals')[0];
  if (!proposal) throw new Error('Visual draft missing');
  await sealRoomProposal(queue, proposal);
  expect(queue.byChamber('visuals')[0]?.state).toBe('proclaimed');
  expect(queue.pending('lottery')).toHaveLength(1);
});

test('lazy Room preserves its props contract, slot and replay link; core mode exposes no simulated controls', async () => {
  for (const chamber of ['lottery', 'moderator', 'visuals', 'studio'] as const) {
    const stream = await renderToReadableStream(<Room chamber={chamber} replay={false} snapshot={fixture}
      origin="overview" on_open={vi.fn()} on_back={vi.fn()} />);
    await stream.allReady;
    const markup = await new Response(stream).text();
    expect(markup).toContain('aria-label="Seal slot"');
    expect(markup).toContain('href="#/overview"');
    expect(markup).not.toContain('generated fixtures only');
    if (chamber === 'visuals') expect(markup).toContain('60 offerings');
    if (chamber === 'studio') expect(markup).toContain('data-hex-tile');
    if (chamber === 'moderator') expect(markup).toContain('#/chamber/moderator/drill');
    const core = renderToStaticMarkup(<Room chamber={chamber} replay={false} snapshot={{ mode: 'core', phase: 'connecting' }}
      origin="keep" on_open={vi.fn()} on_back={vi.fn()} />);
    expect(core).not.toContain('Hold to seal');
    expect(core).not.toContain('data-message-row');
    expect(core).not.toContain('data-lot-dot');
    expect(core).not.toContain('Propose Ban');
    expect(core).not.toContain('>Restyle</button>');
    expect(core).not.toContain('>Custom design</button>');
    if (chamber === 'studio') expect(core).toContain('The map table is bare');
    if (chamber === 'visuals') expect(core).toContain('Local connection unavailable');
  }
});

test('core launch reaches the lazy Gatehouse and drill routes with an isolated connection and no fixture controls', async () => {
  const rpc = vi.fn(async (_endpoint: string, _session: string, method: string) =>
    method === 'gatehouse.chat.list' || method === 'gatehouse.history.list'
      ? { items: [], unavailable_count: 0 }
      : method === 'gatehouse.rules.list' ? fixtureRules : fixtureCharts[0]);
  const launch = { mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) };
  const client = createDesktopClient(launch, undefined, undefined, { rpc });
  const snapshot = client.getSnapshot();
  const fetch = vi.fn(); const socket = vi.fn();
  vi.stubGlobal('fetch', fetch); vi.stubGlobal('WebSocket', socket);
  const render = async (replay: boolean) => {
    const stream = await renderToReadableStream(<Room chamber="moderator" replay={replay} snapshot={snapshot}
      origin="keep" on_open={vi.fn()} on_back={vi.fn()} />);
    await stream.allReady;
    return new Response(stream).text();
  };
  expect(await render(false)).toContain('aria-label="Core Gatehouse"');
  const connection = coreGatehouseConnection(snapshot);
  expect(connection?.port).toBeDefined(); await connection?.port?.load();
  const markup = await render(false);
  expect(markup).toContain('Core opinion directions'); expect(markup).toContain('Save watching rule');
  expect(markup).toContain('href="#/chamber/moderator/drill"');
  expect(markup).toContain('aria-label="Seal slot"');
  for (const text of ['Room data is not configured', 'Propose Ban', 'data-message-row', 'SIMULATED', '>Restyle</button>', '>Custom design</button>', 'Hold to seal']) {
    expect(markup).not.toContain(text);
  }
  const drill = await render(true);
  expect(drill).toContain('simulated replay from core'); expect(drill).toContain('Import recording');
  expect(drill).not.toContain('Generated fixture output');
  expect(rpc.mock.calls.map(call => call[2])).toEqual(['gatehouse.rules.list', 'gatehouse.consensus.get',
    'gatehouse.chat.list', 'gatehouse.history.list']);
  expect(fetch).not.toHaveBeenCalled(); expect(socket).not.toHaveBeenCalled();
  expect(coreGatehouseConnection(createDesktopClient({ mode: 'fixture' }).getSnapshot())).toBeUndefined();
  const other = createDesktopClient({ ...launch, session_token: 'b'.repeat(64) });
  expect(coreGatehouseConnection(other.getSnapshot())).not.toBe(connection);
  expect(coreGatehouseConnection(other.getSnapshot())?.port).toBeUndefined();
  expect(JSON.stringify(snapshot)).not.toContain(launch.session_token);
});

test('fixture launch mounts the existing Lot preview, proposal slot and saved simulated proof', async () => {
  const client = createDesktopClient({ mode: 'fixture' });
  const fetch = vi.fn(); const socket = vi.fn();
  vi.stubGlobal('fetch', fetch); vi.stubGlobal('WebSocket', socket);
  const stream = await renderToReadableStream(<Room chamber="lottery" replay={false} snapshot={client.getSnapshot()}
    origin="keep" on_open={vi.fn()} on_back={vi.fn()} />);
  await stream.allReady;
  const markup = await new Response(stream).text();
  expect(markup).toContain('Writ templates');
  expect(markup).toContain('Saved simulated proof bundle');
  expect(markup).toContain('aria-label="Seal slot"');
  expect(markup).toContain('>Restyle</button>');
  expect(markup).not.toContain('aria-label="Core Lot Chamber"');
  expect(fetch).not.toHaveBeenCalled(); expect(socket).not.toHaveBeenCalled();
});

test('core launch mounts the connected Lots view and never renders simulated controls', async () => {
  const rpc = vi.fn(async (_endpoint: string, _session: string, method: string) =>
    method === 'lots.draw.list' ? { draws: fixtureDraws } : { result: 'ok', reasons: [] });
  const client = createDesktopClient({ mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) }, undefined, { rpc });
  const snapshot = client.getSnapshot();
  const render = async () => {
    const stream = await renderToReadableStream(<Room chamber="lottery" replay={false} snapshot={snapshot}
      origin="keep" on_open={vi.fn()} on_back={vi.fn()} />);
    await stream.allReady;
    return new Response(stream).text();
  };
  const fetch = vi.fn(); const socket = vi.fn();
  vi.stubGlobal('fetch', fetch); vi.stubGlobal('WebSocket', socket);
  expect(await render()).toContain('aria-label="Core Lot Chamber"');
  const port = coreLotsConnection(snapshot)?.port;
  expect(port).toBeDefined(); await port?.load();
  const markup = await render();
  expect(markup).toContain('Draws in your core'); expect(markup).toContain('Questions for the hall');
  expect(markup).toContain('Twitch user ID'); expect(markup).toContain('aria-label="Hold to seal"');
  for (const simulated of ['SIMULATED', 'Saved simulated proof', 'Writ templates', 'Recompute fixture', '>Restyle</button>', '>Custom design</button>', 'data-lot-dot']) {
    expect(markup).not.toContain(simulated);
  }
  expect(rpc.mock.calls.map(call => call[2])).toEqual(['lots.draw.list', 'lots.draw.check']);
  expect(fetch).not.toHaveBeenCalled(); expect(socket).not.toHaveBeenCalled();
  expect(coreLotsConnection(createDesktopClient({ mode: 'fixture' }).getSnapshot())).toBeUndefined();
  rpc.mockRejectedValueOnce({ code: 'unavailable', message: 'Private upstream detail' });
  await port?.check();
  const failed = await render();
  expect(failed).toContain('Draw request failed: unavailable');
  expect(failed).not.toContain('Private upstream detail');
  expect(failed).not.toContain('Saved simulated proof');
});
