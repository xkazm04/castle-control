import { Children, isValidElement } from 'react';
import type { ButtonHTMLAttributes, KeyboardEvent, ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { stewardAsk } from '@castle-control/contract/steward';
import { ProposalCard, SealButton, sealHoldDurationMs } from '@castle-control/ui';
import type { ProposalCardProps } from '@castle-control/ui';
import { LiveSteward, proposalQueue, SimulatedSteward } from '@castle-control/ui/steward';
import type { StewardTransport } from '@castle-control/ui/steward';
import type { StewardConnection } from '../client.js';
import { fixtureDraws } from '../lots-fixture.js';
import { sampleProgram } from '../overview/program.js';
import { Talkback } from '../overview/inspector.jsx';
import { shellStewardPort } from './core-steward.js';
import { createStewardConversation, ShellSteward, stewardConversation } from './steward.jsx';
import { StewardSealSlot } from './steward-slot.jsx';

beforeEach(() => { for (const proposal of proposalQueue.pending()) proposalQueue.tearUp(proposal.id); proposalQueue.select(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
const context = { surface: 'room', chamber: 'lottery' } as const;
function fixtureWrit(value: unknown) {
  if (!stewardAsk.result(value)) throw new Error('Invalid simulated Steward fixture');
  return value.writ;
}
const writ = fixtureWrit({ writ: { writ_id: '01ARZ3NDEKTSV4RRFFQ69G5FAV', chamber: 'lots',
  status: 'proposed', created_at: '2026-10-28T00:00:00Z', updated_at: '2026-10-28T00:00:01Z',
  proposal: { method: 'lots.draw.upsert', diff: { after: { draw: fixtureDraws[0] } } } } });
const response = (status: string) => JSON.stringify({ writ: { ...writ, status } });
const launch = { mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) } as const;
function connection(transport?: StewardTransport): StewardConnection {
  return { launch, live: true, reachable: () => true, ...(transport ? { transport } : {}) };
}

function captureCard(port: LiveSteward): ProposalCardProps {
  let card: ProposalCardProps | undefined;
  function Probe() {
    const slot = StewardSealSlot({ chamber: 'lottery', port });
    Children.forEach(slot.props.children, child => {
      if (isValidElement<ProposalCardProps>(child) && child.type === ProposalCard) card = child.props;
    });
    return slot;
  }
  renderToStaticMarkup(<Probe />);
  if (!card) throw new Error('Expected live review card');
  return card;
}
function nativeSeal(on_seal: () => void): ButtonHTMLAttributes<HTMLButtonElement> {
  let props: ButtonHTMLAttributes<HTMLButtonElement> | undefined;
  function Probe() {
    const control = SealButton({ on_seal }) as ReactElement<Record<string, unknown>,
      (props: Record<string, unknown>) => ReactElement<ButtonHTMLAttributes<HTMLButtonElement>>>;
    const button = control.type(control.props); props = button.props; return button;
  }
  renderToStaticMarkup(<Probe />);
  if (!props) throw new Error('Missing hold control');
  return props;
}
const space = Object.assign({} as KeyboardEvent<HTMLButtonElement>,
  { key: ' ', repeat: false, preventDefault: vi.fn(), nativeEvent: { isComposing: false } });

test('the shell uses the typed core RPC boundary, with no simulation metadata on ask, seal or tear', async () => {
  const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const body = String(init?.body);
    return new Response(response(body.includes('steward.writ.seal') ? 'sealed' : body.includes('steward.writ.tear') ? 'torn' : 'proposed'));
  });
  vi.stubGlobal('fetch', fetch);
  const conn = connection();
  const port = shellStewardPort(conn);
  if (!(port instanceof LiveSteward)) throw new Error('Expected live Steward');
  expect(shellStewardPort(conn)).toBe(port);
  const program = sampleProgram.getSnapshot();
  await stewardConversation.ask('Draft questions', context, port);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(proposalQueue.pending()).toHaveLength(1);
  expect(sampleProgram.getSnapshot()).toBe(program);
  const html = renderToStaticMarkup(<ShellSteward context="lottery" connection={conn}
    on_select={vi.fn()} on_open={vi.fn()} on_overview={vi.fn()} />);
  expect(html).toContain('LIVE STEWARD');
  expect(html).not.toMatch(/simulated co-pilot|SIMULATED STEWARD/);
  const card = captureCard(port);
  vi.useFakeTimers();
  const button = nativeSeal(card.on_seal);
  expect(button.onClick).toBeUndefined();
  button.onKeyDown?.(space); vi.advanceTimersByTime(sealHoldDurationMs - 1); button.onKeyUp?.(space);
  expect(fetch).toHaveBeenCalledTimes(1);
  button.onKeyDown?.(space); vi.advanceTimersByTime(sealHoldDurationMs); button.onKeyUp?.(space);
  await vi.waitFor(() => { expect(proposalQueue.pending()).toHaveLength(0); });
  expect(proposalQueue.getSnapshot().proposals.find(item => item.id === writ.writ_id)?.state).toBe('sealed');
  expect(sampleProgram.getSnapshot()).toBe(program);
  expect(fetch.mock.calls.map(([, init]) => init?.body)).toEqual([
    JSON.stringify({ method: 'steward.ask', params: { chamber: 'lots', prompt: 'Draft questions' } }),
    JSON.stringify({ method: 'steward.writ.seal', params: { writ_id: writ.writ_id } }),
  ]);
  for (const [url, init] of fetch.mock.calls) {
    expect(String(url)).toBe('http://127.0.0.1:3210/rpc');
    expect(init?.headers).toHaveProperty('authorization', `Bearer ${launch.session_token}`);
    expect(String(init?.body)).not.toMatch(/simulated|session_token|"live"/);
  }
});

test('a live room tear-up calls the core and discards without sealing or applying', async () => {
  const alternate = { ...writ, writ_id: '01ARZ3NDEKTSV4RRFFQ69G5FAW' };
  const transport = { ask: vi.fn(async () => JSON.stringify({ writ: alternate })),
    seal: vi.fn(async () => response('sealed')),
    tear: vi.fn(async () => JSON.stringify({ writ: { ...alternate, status: 'torn' } })) };
  const port = shellStewardPort(connection(transport));
  if (!(port instanceof LiveSteward)) throw new Error('Expected live Steward');
  await stewardConversation.ask('Draft questions', context, port);
  const program = sampleProgram.getSnapshot();
  captureCard(port).on_tear();
  await vi.waitFor(() => { expect(proposalQueue.pending()).toHaveLength(0); });
  expect(transport.tear).toHaveBeenCalledExactlyOnceWith({ writ_id: alternate.writ_id });
  expect(transport.seal).not.toHaveBeenCalled();
  expect(sampleProgram.getSnapshot()).toBe(program);
});

test('no opt-in or absent/unreachable capability preserves the simulated shell; disconnect blocks a cached live port', async () => {
  const transport = { ask: vi.fn(), seal: vi.fn(), tear: vi.fn() };
  let reachable = true;
  const conn = { ...connection(transport), reachable: () => reachable };
  const live = shellStewardPort(conn);
  expect(live).toBeInstanceOf(LiveSteward);
  reachable = false;
  for (const candidate of [undefined, { ...conn, live: false }, conn]) {
    expect(shellStewardPort(candidate)).toBeInstanceOf(SimulatedSteward);
    expect(renderToStaticMarkup(<ShellSteward context="keep" {...(candidate ? { connection: candidate } : {})}
      on_select={vi.fn()} on_open={vi.fn()} on_overview={vi.fn()} />)).toContain('SIMULATED STEWARD · SAMPLE DATA');
  }
  expect((await live.ask('Draft questions', context)).proposals).toEqual([]);
  expect(transport.ask).not.toHaveBeenCalled();
});

test('a reply from a LiveSteward engine is stored live and Talkback captions it Steward · live', async () => {
  const simulated = new SimulatedSteward();
  const conversation = createStewardConversation(simulated);
  vi.spyOn(stewardConversation, 'getSnapshot').mockImplementation(conversation.getSnapshot);
  const greeting = renderToStaticMarkup(<Talkback />);
  const live = new LiveSteward({ ask: vi.fn(async () => JSON.stringify({ writ: { ...writ, writ_id: '01ARZ3NDEKTSV4RRFFQ69G5FAZ' } })),
    seal: vi.fn(), tear: vi.fn() });
  await conversation.ask('Synthetic draw', context, live);
  expect(renderToStaticMarkup(<Talkback />)).toContain('<b>Steward · live</b>');
  expect(conversation.getSnapshot().at(-1)).toMatchObject({ who: 'Steward', live: true });
  expect(greeting).toContain('<b>Steward</b>');
  expect(greeting).not.toContain('Steward · simulated');
  await conversation.ask('draft a question draw', context, simulated);
  expect(conversation.getSnapshot().at(-1)).toMatchObject({ who: 'Steward', live: false });
  const mixed = renderToStaticMarkup(<Talkback />);
  expect(mixed).toContain('<b>Steward · live</b>');
  expect(mixed).toContain('<b>Steward · simulated</b>');
});
