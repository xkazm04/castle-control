import type { KeyboardEvent } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ChamberStrip, ProposalCard, SealControl, createSealHold, sealHoldDurationMs, chambers } from '@castle-control/ui';
import type { ModuleId } from '@castle-control/ui';
import { proposalQueue, SimulatedSteward } from '@castle-control/ui/steward';
import { dispatchShortcut } from '../navigation.js';
import { tearFocusedProposal } from '../app.jsx';
import { simulatedRead } from '../simulated.js';
import { Keep } from '../keep/keep.jsx';
import { Overview } from '../overview/overview.jsx';
import { StreamScene } from '../overview/scene.jsx';
import { programCandidate, proclaimToSampleProgram, sampleProgram } from '../overview/program.js';
import { createStewardConversation, routeStewardTurn, ShellSteward, stewardContext, StewardProposal } from './steward.jsx';

const snapshot = { mode: 'fixture', phase: 'ready', ...simulatedRead(1) } as const;
const overview = () => renderToStaticMarkup(<Overview snapshot={snapshot} selected="lottery" on_select={() => undefined} on_open={() => undefined} />);
const program = () => renderToStaticMarkup(<StreamScene mode="program" proposals={sampleProgram.getSnapshot()} sample />);
beforeEach(() => { for (const proposal of proposalQueue.pending()) proposalQueue.tearUp(proposal.id); proposalQueue.select(); });
afterEach(() => { vi.useRealTimers(); });

test('Steward bar shows only the newest pending queue proposal and removes empty chrome after tear-up', async () => {
  const steward = new SimulatedSteward();
  await steward.ask('draft a question draw', { surface: 'keep' });
  const first = proposalQueue.pending().at(-1);
  await steward.ask('raise the drawbridge', { surface: 'keep' });
  const newest = proposalQueue.pending().at(-1);
  if (!first || !newest || first.id === newest.id) throw new Error('Missing distinct proposals');
  proposalQueue.amend(newest.id, [{ key: 'shield', value: true }]);
  const render = () => renderToStaticMarkup(<ShellSteward context="keep" on_select={vi.fn()} on_open={vi.fn()} on_overview={vi.fn()} />);
  const before = proposalQueue.getSnapshot();
  const html = render();
  expect(html).toContain('aria-label="Steward identity"');
  expect(html).toContain('PROPOSAL · AWAITING YOUR SEAL');
  expect(html).toContain(newest.title);
  expect(html).not.toContain(first.title);
  expect(html.match(/<input/g)).toHaveLength(1);
  expect(proposalQueue.getSnapshot()).toBe(before);
  proposalQueue.tearUp(newest.id);
  expect(render()).toContain(first.title);
  proposalQueue.tearUp(first.id);
  expect(render()).not.toContain('aria-label="Steward proposal"');
});

test('Steward proposal review selects and opens the existing guarded room without sealing or tearing', async () => {
  await new SimulatedSteward().ask('draft a question draw', { surface: 'keep' });
  const proposal = proposalQueue.pending().at(-1);
  if (!proposal) throw new Error('Missing proposal');
  const open = vi.fn();
  const tree = StewardProposal({ proposal, on_open: open });
  const html = renderToStaticMarkup(tree);
  expect(html).toContain('Review in the room');
  expect(html).not.toContain('data-seal-control');
  expect(html).not.toContain('data-tear-proposal');
  tree.props.children[3].props.onClick();
  expect(open).toHaveBeenCalledWith('lottery');
  expect(proposalQueue.getSnapshot().selected_proposal_id).toBe(proposal.id);
  expect(proposalQueue.pending().at(-1)).toBe(proposal);
});

test('Keep is a cross-section with live rule summaries, the Herald, moat and numbered room paths', () => {
  const html = renderToStaticMarkup(<Keep snapshot={snapshot} on_open={() => undefined} on_enter={() => undefined} />);
  for (const text of ['The Herald', 'Chat consensus', 'Chat delay', '4 s', 'Armed 0', 'Watching 3', 'Enter the keep']) expect(html).toContain(text);
  expect(html).not.toContain('The lit keep');
  expect(html).not.toContain('<h1');
  for (const { id, number } of chambers) {
    expect(html).toContain(`data-room-tile="${id}"`);
    expect(html).toContain(`<kbd>${number}</kbd>`);
  }
  const core = renderToStaticMarkup(<Keep snapshot={{ mode: 'core', phase: 'ready' }} on_open={() => undefined} on_enter={() => undefined} />);
  expect(core).toContain('Consensus unknown');
  expect(core).toContain('Draw status unavailable');
  expect(core).not.toContain('sample lots');
});

test('Overview has four preview layers, simulated Program, tabs, fairness and held chat only in Preview', () => {
  const html = overview();
  for (const text of ['Stream preview', 'Program monitor', 'Talkback', 'Inspector', 'Draw fairness', 'Open the room', 'Chamber strip', 'DRAFT · NOT ON AIR']) expect(html).toContain(text);
  for (const id of ['lottery', 'moderator', 'visuals', 'studio']) expect(html).toContain(`data-layer="${id}"`);
  expect(html).toContain('HELD · NOT ON AIR');
  expect(program()).not.toContain('HELD');
  expect(program()).not.toContain('data-held="true"');
});

test('Steward asks and amendments use one queue proposal, visible in the draft layer and Inspector', async () => {
  const network = vi.spyOn(globalThis, 'fetch');
  try {
    const conversation = createStewardConversation(new SimulatedSteward());
    await conversation.ask('draft a question draw', { surface: 'overview' });
    await conversation.ask('make it 5 winners', stewardContext('overview'));
    expect(proposalQueue.pending()).toHaveLength(1);
    const proposal = proposalQueue.pending()[0];
    expect(proposal?.revision).toBe(2);
    const html = overview();
    expect(html).toContain('data-draft-frame');
    expect(html).toContain('Question draw proposal');
    expect(html).toContain('<s>3</s>');
    expect(html).toContain('cc-proposal-reink');
    expect(html).toContain('>5</span>');
    expect(program()).not.toContain('Question draw');
    expect(conversation.getSnapshot().filter(line => line.who === 'You')).toHaveLength(2);
    expect(network).not.toHaveBeenCalled();
  } finally { network.mockRestore(); }
});

test('0 and 1-4 navigate; strip Enter opens selected room; slash focuses the one input; Delete tears the focused proposal', async () => {
  const open = vi.fn(); const enter = vi.fn(); const focus = vi.fn();
  let selected: ModuleId = 'lottery';
  const state = { line: 'Sample', on_air: false, preview: true, draft: true };
  const tiles = ChamberStrip({ selected, states: { lottery: state, moderator: state, visuals: state, studio: state },
    on_select: id => { selected = id; }, on_open: open }).props.children;
  tiles[2]?.props.onFocus();
  expect(selected).toBe('visuals');
  dispatchShortcut({ key: 'Enter', preventDefault: vi.fn() }, false, open, focus, { open: () => open(selected) });
  expect(open).toHaveBeenCalledWith('visuals');
  tiles[3]?.props.onDoubleClick();
  expect(open).toHaveBeenLastCalledWith('studio');
  for (const { number, id } of chambers) {
    dispatchShortcut({ key: number, preventDefault: vi.fn() }, false, open, focus);
    expect(open).toHaveBeenLastCalledWith(id);
  }
  dispatchShortcut({ key: '0', preventDefault: vi.fn() }, false, open, focus, { overview: enter });
  dispatchShortcut({ key: '/', preventDefault: vi.fn() }, false, open, focus);
  expect(enter).toHaveBeenCalledOnce(); expect(focus).toHaveBeenCalledOnce();
  await new SimulatedSteward().ask('draft a question draw', { surface: 'overview' });
  const proposal = proposalQueue.pending()[0];
  if (!proposal) throw new Error('Missing proposal');
  const card = ProposalCard({ proposal, focused: true, on_seal: vi.fn(), on_tear: () => { proposalQueue.tearUp(proposal.id); } });
  const root = { querySelector: vi.fn() };
  root.querySelector.mockReturnValue({ click: card.props.children.at(-1).props.children[1].props.onClick });
  dispatchShortcut({ key: 'Delete', preventDefault: vi.fn() }, false, open, focus, { tear: () => tearFocusedProposal(root) });
  expect(root.querySelector).toHaveBeenCalledWith('[data-proposal-focused="true"] [data-tear-proposal]');
  expect(proposalQueue.pending()).toHaveLength(0);
  expect(program()).not.toContain('Question draw');
});

test('Steward focus selects a layer in Overview, opens a room from Keep, and general asks enter Overview', () => {
  const select = vi.fn(); const open = vi.fn(); const overview = vi.fn();
  const turn = { reply: 'Draft', proposals: [], focus: { chamber: 'lottery' as const, layer: 'draw' } };
  routeStewardTurn(turn, 'overview', select, open, overview);
  expect(select).toHaveBeenCalledWith('lottery'); expect(open).not.toHaveBeenCalled();
  routeStewardTurn(turn, 'keep', select, open, overview);
  expect(open).toHaveBeenCalledWith('lottery');
  routeStewardTurn({ ...turn, focus: null }, 'keep', select, open, overview);
  expect(overview).toHaveBeenCalledOnce();
});

test('Program is unchanged by a click or short Space; a full held Space seals the frozen sample roll and proclaims it', async () => {
  await new SimulatedSteward().ask('draft a question draw', { surface: 'overview' });
  const proposal = proposalQueue.pending()[0];
  if (!proposal) throw new Error('Missing proposal');
  const before = sampleProgram.getSnapshot();
  vi.useFakeTimers();
  const jobs: Promise<string>[] = [];
  const hold = createSealHold(() => { jobs.push(proclaimToSampleProgram(proposal.id)); }, () => undefined);
  const button = SealControl({ hold, progress: 0, variant: 'proclaim' });
  const space = Object.assign({} as KeyboardEvent<HTMLButtonElement>, { key: ' ', preventDefault: vi.fn(), nativeEvent: { isComposing: false }, repeat: false });
  expect(button.props.onClick).toBeUndefined();
  expect(sampleProgram.getSnapshot()).toBe(before);
  button.props.onKeyDown(space); vi.advanceTimersByTime(sealHoldDurationMs / 2); button.props.onKeyUp(space);
  vi.advanceTimersByTime(sealHoldDurationMs);
  expect(sampleProgram.getSnapshot()).toBe(before);
  button.props.onKeyDown(space); vi.advanceTimersByTime(sealHoldDurationMs);
  await Promise.all(jobs); hold.cancel();
  expect(proposalQueue.getSnapshot().proposals.find(item => item.id === proposal.id)?.seal_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(sampleProgram.getSnapshot().some(item => item.id === proposal.id)).toBe(true);
  expect(program()).toContain('Question draw');
  expect(program()).not.toContain('HELD');
  expect(programCandidate('lottery')).toBeUndefined();
});
