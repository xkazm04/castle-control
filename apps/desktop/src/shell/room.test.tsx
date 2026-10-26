import { Children, isValidElement } from 'react';
import type { ButtonHTMLAttributes, KeyboardEvent, ReactElement, ReactNode } from 'react';
import { renderToReadableStream, renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { SealButton, sealHoldDurationMs } from '@castle-control/ui';
import { ProposalQueue, SimulatedSteward } from '@castle-control/ui/steward';
import SealSlot, { ProposalSlotCard, sealRoomProposal } from '../rooms/seal-slot/index.jsx';
import { draftRoll } from '../rooms/lottery/session.js';
import { backHash, dispatchShortcut, initialNavigation, navigateHash } from '../navigation.js';
import Room from './room.jsx';

afterEach(() => { vi.useRealTimers(); });
const fixture = { mode: 'fixture', phase: 'ready' } as const;
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
  const tree = ProposalSlotCard({ proposal, queue, focused: true, busy: false, on_seal: seal });
  expect(tree.props['data-proposal-focused']).toBe('true');
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
    if (chamber === 'moderator') expect(markup).toContain('#/chamber/moderator/drill');
    const core = renderToStaticMarkup(<Room chamber={chamber} replay={false} snapshot={{ mode: 'core', phase: 'connecting' }}
      origin="keep" on_open={vi.fn()} on_back={vi.fn()} />);
    expect(core).not.toContain('Hold to seal');
    expect(core).not.toContain('data-message-row');
    expect(core).not.toContain('data-lot-dot');
    expect(core).not.toContain('Propose Ban');
  }
});
