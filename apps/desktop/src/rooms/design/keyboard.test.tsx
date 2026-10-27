import { Children, isValidElement } from 'react';
import type { KeyboardEvent, ReactElement, ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import { renderToReadableStream, renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { sealHoldDurationMs } from '@castle-control/ui';
import { DesignFocus, DesignSession, designSession, presetsFor } from '@castle-control/ui/design';
import { ProposalQueue, proposalQueue } from '@castle-control/ui/steward';
import type { Proposal } from '@castle-control/ui/steward';
import { DesignInspector, designSelection } from '../../overview/design.jsx';
import { dispatchShortcut, initialNavigation, navigateHash } from '../../navigation.js';
import SealSlot, { sealRoomProposal } from '../seal-slot/index.jsx';
import { RoomDesignActions, roomProposals, selectRoomDesign } from './actions.jsx';
import type { RoomDesignSelection } from './actions.jsx';
import { RoomDesignDialog, RoomDesignProposal } from './focus.jsx';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

type NativeProps = {
  children?: ReactNode; type?: string; tabIndex?: number; disabled?: boolean;
  value?: string; 'aria-label'?: string; onClick?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
  onKeyUp?: (event: KeyboardEvent<HTMLButtonElement>) => void;
};

/** Run public kit components under React's server dispatcher and capture their
 * actual native handlers. Native Tab/Enter/select semantics need no second keymap.
 * This is handler coverage, not a browser layout or focus-trap simulation. */
function controls(element: ReactNode): ReactElement<NativeProps>[] {
  const found: ReactElement<NativeProps>[] = [];
  function Probe() {
    const visit = (tree: ReactNode): void => Children.forEach(tree, child => {
      if (!isValidElement<Record<string, unknown>>(child)) return;
      if (typeof child.type === 'function') {
        const component = child.type as (props: Record<string, unknown>) => ReactNode;
        visit(component(child.props));
      } else {
        if (['button', 'select', 'input'].includes(String(child.type))) found.push(child as ReactElement<NativeProps>);
        visit(child.props.children as ReactNode);
      }
    });
    visit(element);
    return null;
  }
  renderToStaticMarkup(<Probe />);
  return found;
}

function button(items: readonly ReactElement<NativeProps>[], label: string) {
  const item = items.find(item => item.type === 'button'
    && (item.props.children === label || item.props['aria-label'] === label));
  if (!item) throw new Error(`Missing ${label}`);
  return item.props;
}
function activate(props: NativeProps) {
  expect(props.type).toBe('button');
  expect(props.tabIndex).not.toBe(-1);
  expect(props.disabled).not.toBe(true);
  // Native Enter/Space delivers click on these tabbable buttons.
  props.onClick?.();
}
const space = () => Object.assign({} as KeyboardEvent<HTMLButtonElement>, {
  key: ' ', repeat: false, preventDefault: vi.fn(), nativeEvent: { isComposing: false },
});
function proposal(queue: ProposalQueue): Proposal {
  const result = queue.pending().at(-1);
  if (!result) throw new Error('Missing design proposal');
  return result;
}
const rooms = [
  ['1', 'lottery', 'draw'], ['2', 'moderator', 'overlay'], ['3', 'visuals', 'beacon'], ['4', 'studio', 'map'],
] as const;

test.each(rooms)('%s opens %s: Tab/Restyle, native preset, Preview, held Space and tear-up', (key, chamber, artifact) => {
  vi.useFakeTimers();
  const session = new DesignSession(new ProposalQueue());
  const queue = session.queue;
  const before = session.current(artifact);
  try {
    let navigation = initialNavigation('#/overview');
    dispatchShortcut({ key, preventDefault: vi.fn() }, false,
      id => { navigation = navigateHash(navigation, `#/chamber/${id}`); }, vi.fn());
    expect(navigation.current).toBe(chamber);
    let selection: RoomDesignSelection | undefined;
    const actions = controls(<RoomDesignActions chamber={chamber} on_open={value => { selection = value; selectRoomDesign(queue, value); }} />);
    activate(button(actions, 'Restyle'));
    expect(selection).toEqual({ artifact, action: 'restyle' });
    expect(queue.pending()).toHaveLength(0);
    const focus = () => controls(<DesignFocus artifact={artifact} session={session} />);
    // Accept the focused native select's first preset with Enter, then Tab to Restyle.
    const select = focus().find(item => item.type === 'select');
    expect(select?.props.tabIndex).not.toBe(-1);
    expect(select?.props.value).toBe(presetsFor(artifact)[0]?.id);
    activate(button(focus(), 'Restyle'));
    const draft = proposal(queue);
    expect(roomProposals(queue, chamber)).toEqual([draft]);
    expect(session.current(artifact)).toBe(before);
    const slot = () => controls(<RoomDesignProposal proposal={proposal(queue)} artifact={artifact}
      focused on_open={vi.fn()} session={session} />);
    const hold_label = 'Hold to seal and proclaim';
    expect(button(focus(), hold_label).disabled).toBe(true);
    expect(button(slot(), hold_label).disabled).toBe(true);
    const blocked = button(slot(), hold_label);
    blocked.onKeyDown?.(space()); vi.advanceTimersByTime(sealHoldDurationMs);
    expect(session.current(artifact)).toBe(before);
    activate(button(focus(), 'Preview draft'));
    expect(button(focus(), hold_label).disabled).toBe(false);
    expect(button(slot(), hold_label).disabled).toBe(false);
    const preview = session.getSnapshot().previews[draft.id];
    const held = button(slot(), hold_label);
    expect(held.onClick).toBeUndefined();
    held.onKeyDown?.(space()); vi.advanceTimersByTime(sealHoldDurationMs - 1); held.onKeyUp?.(space());
    expect(session.current(artifact)).toBe(before);
    held.onKeyDown?.(space()); vi.advanceTimersByTime(sealHoldDurationMs); held.onKeyUp?.(space());
    expect(session.current(artifact).output).toBe(preview?.output);
    expect(session.current(artifact).revision).toBe(before.revision + 1);
    expect(queue.pending()).toHaveLength(0);
    activate(button(actions, 'Custom design'));
    expect(selection).toEqual({ artifact, action: 'custom' });
    expect(renderToStaticMarkup(<RoomDesignDialog selection={{ artifact, action: 'custom' }} on_close={vi.fn()} session={session} />))
      .toContain('Describe a style');
    activate(button(focus(), 'Restyle'));
    activate(button(focus(), 'Preview draft'));
    const atTear = session.current(artifact);
    const id = proposal(queue).id;
    activate(button(slot(), 'Tear it up'));
    expect(queue.pending()).toHaveLength(0);
    expect(session.getSnapshot().previews[id]).toBeUndefined();
    expect(session.current(artifact)).toBe(atTear);
  } finally { session.dispose(); }
});

test.each(rooms)('%s %s refuses revisions amended, torn or superseded during a room hold', (_key, _chamber, artifact) => {
  vi.useFakeTimers();
  for (const cause of ['amended', 'torn', 'superseded'] as const) {
    const session = new DesignSession(new ProposalQueue());
    try {
      const draft = session.draft({ action: 'custom', artifact, prompt: 'quiet engraved' });
      if (!draft.ok) throw new Error(draft.reason);
      session.preview(draft.proposal.id);
      const slot = () => controls(<RoomDesignProposal proposal={proposal(session.queue)} artifact={artifact}
        focused on_open={vi.fn()} session={session} />);
      const seal = button(slot(), 'Hold to seal and proclaim');
      seal.onKeyDown?.(space());
      if (cause === 'amended') session.amend(draft.proposal.id, { action: 'custom', artifact, prompt: 'bold plain' });
      if (cause === 'torn') session.tearUp(draft.proposal.id);
      if (cause === 'superseded') {
        const other = session.draft({ action: 'restyle', artifact, preset_id: presetsFor(artifact)[1]?.id ?? '' });
        if (!other.ok) throw new Error(other.reason);
        const result = session.preview(other.proposal.id);
        if (!result.ok) throw new Error(result.reason);
        session.seal(result.preview);
      }
      const current = session.current(artifact);
      vi.advanceTimersByTime(sealHoldDurationMs); seal.onKeyUp?.(space());
      expect(session.current(artifact)).toBe(current);
      if (cause === 'amended') expect(button(slot(), 'Hold to seal and proclaim').disabled).toBe(true);
    } finally { session.dispose(); }
  }
});

test.each(rooms)('%s %s reopens the same Overview draft in the singleton seal slot', async (_key, chamber, artifact) => {
  for (const item of proposalQueue.pending()) proposalQueue.tearUp(item.id);
  const initial = designSession.current(artifact);
  const result = designSession.draft({ action: 'custom', artifact, prompt: 'quiet engraved' });
  if (!result.ok) throw new Error(result.reason);
  try {
    const overview = designSelection(designSession, { artifact, action: 'custom' });
    const ids = proposalQueue.getSnapshot().proposals.map(item => item.id);
    renderToStaticMarkup(<DesignInspector selected={chamber} />);
    for (let reopen = 0; reopen < 3; reopen++) {
      selectRoomDesign(proposalQueue, { artifact, action: 'restyle' });
      expect(proposalQueue.getSnapshot().selected_proposal_id).toBe(overview.proposal_id);
      renderToStaticMarkup(<RoomDesignDialog selection={{ artifact, action: 'restyle' }} on_close={vi.fn()} />);
    }
    const stream = await renderToReadableStream(<SealSlot chamber={chamber} />);
    await stream.allReady;
    const markup = await new Response(stream).text();
    expect(markup).toContain('PROPOSAL · AWAITING YOUR SEAL');
    expect(markup).toContain('quiet engraved');
    expect(markup).toContain('Review design');
    expect(markup).toContain('Preview required');
    expect(markup).toMatch(/disabled="" aria-label="Hold to seal and proclaim"/);
    expect(proposalQueue.getSnapshot().proposals.map(item => item.id)).toEqual(ids);
    expect(proposalQueue.pending()).toHaveLength(1);
    await expect(sealRoomProposal(proposalQueue, result.proposal)).rejects.toThrow('design focus');
    expect(designSession.current(artifact)).toBe(initial);
  } finally { designSession.tearUp(result.proposal.id); proposalQueue.select(); }
});

test('room design paths remain lazy, simulated, token based and isolated from network or code execution', () => {
  const fetch = vi.fn(() => { throw new Error('Forbidden'); });
  const socket = vi.fn(() => { throw new Error('Forbidden'); });
  vi.stubGlobal('fetch', fetch); vi.stubGlobal('WebSocket', socket);
  const source = readFileSync(new URL('../seal-slot/index.tsx', import.meta.url), 'utf8');
  expect(source).toContain("lazy(() => import('../design/focus.jsx')");
  expect(source).not.toContain("from '@castle-control/ui/design'");
  for (const name of ['actions.tsx', 'focus.tsx']) {
    const text = readFileSync(new URL(name, import.meta.url), 'utf8');
    expect(text).not.toMatch(/\beval\s*\(|\bfetch\s*\(|new (Function|WebSocket)|dangerouslySetInnerHTML|\u2014/);
  }
  const css = readFileSync(new URL('room.css', import.meta.url), 'utf8');
  expect(css).not.toMatch(/#[\da-f]{3,8}\b|\b\d+(?:\.\d+)?px\b/i);
  const session = new DesignSession(new ProposalQueue());
  try {
    for (const artifact of ['draw', 'overlay', 'beacon', 'map'] as const) {
      renderToStaticMarkup(<RoomDesignDialog selection={{ artifact, action: 'custom' }} session={session} on_close={vi.fn()} />);
      const result = session.draft({ action: 'custom', artifact, prompt: 'bold engraved' });
      if (!result.ok) throw new Error(result.reason);
      session.preview(result.proposal.id); session.tearUp(result.proposal.id);
    }
    expect(fetch).not.toHaveBeenCalled(); expect(socket).not.toHaveBeenCalled();
  } finally { session.dispose(); }
});
