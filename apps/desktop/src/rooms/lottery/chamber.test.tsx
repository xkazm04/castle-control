import { keyFor } from '../../shell/steward-keys.jsx';
import { Children, isValidElement, useState } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { ChamberLayout } from '@castle-control/ui/chamber';
import { ProposalQueue } from '@castle-control/ui/steward';
import LotteryRoom from './index.jsx';
import { ConnectedLotsRoom } from './core.jsx';
import { createCoreLotsPort } from '../../lots-core.js';
import { CeremonyControls } from './stage.jsx';
import type { CeremonyControlsProps } from './stage.jsx';
import { LotChamber } from './chamber.jsx';
import type { LotChamberProps } from './chamber.jsx';
import { lotDrawer } from './drawer.js';
import { lotterySession } from './session.js';
import { RevealedWinners } from './revealed.jsx';
import { createRevealClock } from './playback.js';
import { stageScene } from './stage-model.js';
import { fixtureWrit } from '../../lots-fixture.js';

type TreeProps = ButtonHTMLAttributes<HTMLButtonElement> & { columns?: readonly ReactNode[] };
function trigger(tree: ReactNode, label = 'The writ and draw tools'): TreeProps | undefined {
  let found: TreeProps | undefined;
  Children.forEach(tree, child => {
    if (!isValidElement<TreeProps>(child)) return;
    if (child.type === 'button' && Children.toArray(child.props.children).includes(label)) found = child.props;
    else found ??= trigger(child.props.children, label) ?? trigger(child.props.columns, label);
  });
  return found;
}

test.each([['fixture', 'writ'], ['fixture', 'ceremony'], ['core', 'writ'], ['core', 'ceremony']] as const)('%s chamber opens and closes its drawer from the %s section trigger', (mode, source) => {
  const queue = new ProposalQueue();
  const core = createCoreLotsPort({ mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) });
  const owner = mode === 'fixture' ? lotterySession(queue).port : core;
  const frames: ReactNode[] = [];
  function Sequence() {
    const [step, setStep] = useState(0);
    const room = mode === 'fixture' ? LotteryRoom({ snapshot: { mode: 'fixture', phase: 'ready' }, replay: false, queue })
      : ConnectedLotsRoom({ port: core });
    if (!isValidElement<LotChamberProps>(room) || room.type !== LotChamber) throw new Error('Missing LotChamber');
    const frame = LotChamber(room.props);
    const layout = Children.toArray(frame.props.children).find(child => isValidElement(child) && child.type === ChamberLayout);
    expect(layout).toBeDefined();
    expect(room.props.picture).toBeDefined();
    const setup = room.props.setup;
    const ceremony = isValidElement<{ children?: ReactNode }>(setup) ? Children.toArray(setup.props.children)
      .find(child => isValidElement(child) && child.type === CeremonyControls) : undefined;
    const control = source === 'ceremony' && isValidElement<CeremonyControlsProps>(ceremony)
      ? trigger(CeremonyControls(ceremony.props), 'Ceremony options') : trigger(frame);
    expect(control).toBeDefined();
    frames.push(frame);
    if (step === 0) {
      expect(control?.['aria-expanded']).toBe(false);
      control?.onClick?.({} as Parameters<NonNullable<TreeProps['onClick']>>[0]);
      expect(lotDrawer(owner).getSnapshot()).toBe(true);
      setStep(1);
    } else if (step === 1) {
      expect(control?.['aria-expanded']).toBe(true);
      room.props.on_close();
      expect(lotDrawer(owner).getSnapshot()).toBe(false);
      setStep(2);
    }
    return frame;
  }
  renderToStaticMarkup(<Sequence />);
  const seen = frames.map(frame => renderToStaticMarkup(frame));
  expect(seen).toHaveLength(3);
  expect(seen[0]).not.toContain('role="dialog"');
  expect(seen[1]).toContain('role="dialog"');
  expect(seen[1]).toContain('The writ and the draw tools');
  expect(seen[1]).toContain('aria-label="Entry lookup"');
  expect(seen[1]).toContain('class="cc-numbered-discs"');
  expect(seen[2]).not.toContain('role="dialog"');
  for (const html of seen) {
    expect(html.match(/data-role="room-picture"/g)).toHaveLength(1);
    expect(html.match(/class="cc-chamber-column"/g)).toHaveLength(2);
    expect(html.match(/data-role="room-section"/g)).toHaveLength(html.includes('role="dialog"') ? mode === 'fixture' ? 7 : 6 : 5);
  }
});

test('the proof card follows hand reveals and rejects a cursor from an older seal', () => {
  const clock = createRevealClock();
  const seal = fixtureWrit.seal;
  const key = `${seal}:urn:0`;
  const scene = stageScene('urn', { winners: fixtureWrit.winners, label: 'streamer-controlled' }, 'question', false);
  const html = (current = seal) => renderToStaticMarkup(<RevealedWinners clock={clock} seal={current} total={fixtureWrit.winners.length} />);
  clock.pace(true, 0);
  clock.tick(scene, key, 0);
  clock.tick(scene, key, 100_000);
  expect(html()).toContain(`0 of ${fixtureWrit.winners.length} revealed`);
  for (const winner of fixtureWrit.winners) expect(html()).not.toContain(winner);
  clock.callNext(100_000);
  expect(html()).toContain(`1 of ${fixtureWrit.winners.length} revealed`);
  expect(html()).toContain(fixtureWrit.winners[0]);
  for (const winner of fixtureWrit.winners.slice(1)) expect(html()).not.toContain(winner);
  expect(html('different-seal')).toContain(`0 of ${fixtureWrit.winners.length} revealed`);
});

test('Lot controls retain their table keys, and secondary controls are reachable in the drawer', () => {
  const queue = new ProposalQueue();
  const room = <LotteryRoom snapshot={{ mode: 'fixture', phase: 'ready' }} replay={false} queue={queue} />;
  const closed = renderToStaticMarkup(room);
  for (const action of ['setup', 'cast', 'tools', 'winners', 'held_out', 'cap', 'ceremony']) {
    expect(closed).toContain(`cc-key-badge">${keyFor('lottery', action)}</kbd>`);
  }
  for (const moved of ['Reveal by hand', 'Ceremony sound', 'Play demo', 'data-role="lot-legend"']) expect(closed).not.toContain(moved);
  const drawer = lotDrawer(lotterySession(queue).port);
  drawer.open();
  try {
    const opened = renderToStaticMarkup(room);
    const content = opened.slice(opened.indexOf('role="dialog"'));
    for (const action of ['by_hand', 'sound', 'info']) expect(content).toContain(`cc-key-badge">${keyFor('lottery', action)}</kbd>`);
    for (const moved of ['Reveal by hand', 'Ceremony sound', 'Play demo', 'data-role="lot-legend"']) expect(content).toContain(moved);
  } finally { drawer.close(); }
});

test('the compact proof summary retains the full explanation inside the reachable drawer', () => {
  const queue = new ProposalQueue();
  const room = <LotteryRoom snapshot={{ mode: 'fixture', phase: 'ready' }} replay={false} queue={queue} />;
  const closed = renderToStaticMarkup(room);
  expect(closed).toContain('SIMULATED \u00b7 writ follows the cast.');
  expect(closed).not.toContain('Replay the draw from its seed to check the winners.');
  expect(closed).toContain('class="lottery-draw-actions lottery-primary-actions"');
  const drawer = lotDrawer(lotterySession(queue).port);
  drawer.open();
  try {
    const opened = renderToStaticMarkup(room);
    const content = opened.slice(opened.indexOf('role="dialog"'));
    expect(content).toContain('Replay the draw from its seed to check the winners.');
    expect(content).toContain('Stylised illustration');
    expect(content).toContain('SIMULATED');
  } finally { drawer.close(); }
});

test('the compact reveal summary never exposes winner names, while the full drawer list follows the same cursor', () => {
  const clock = createRevealClock();
  const key = `${fixtureWrit.seal}:urn:0`;
  const scene = stageScene('urn', { winners: fixtureWrit.winners, label: 'streamer-controlled' }, 'question', false);
  clock.pace(true, 0); clock.tick(scene, key, 0); clock.tick(scene, key, 100_000); clock.callNext(100_000);
  const summary = renderToStaticMarkup(<RevealedWinners compact clock={clock} seal={fixtureWrit.seal} total={fixtureWrit.winners.length} />);
  expect(summary).toContain(`1 of ${fixtureWrit.winners.length} revealed`);
  for (const winner of fixtureWrit.winners) expect(summary).not.toContain(winner);
  const full = renderToStaticMarkup(<RevealedWinners clock={clock} seal={fixtureWrit.seal} total={fixtureWrit.winners.length} />);
  expect(full).toContain(fixtureWrit.winners[0]);
  for (const winner of fixtureWrit.winners.slice(1)) expect(full).not.toContain(winner);
});
