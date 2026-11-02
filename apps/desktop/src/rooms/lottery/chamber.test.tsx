import { Children, isValidElement, useState } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { ChamberLayout } from '@castle-control/ui/chamber';
import { ProposalQueue } from '@castle-control/ui/steward';
import LotteryRoom from './index.jsx';
import { ConnectedLotsRoom } from './core.jsx';
import { createCoreLotsPort } from '../../lots-core.js';
import { LotChamber } from './chamber.jsx';
import type { LotChamberProps } from './chamber.jsx';
import { lotDrawer } from './drawer.js';
import { lotterySession } from './session.js';
import { RevealedWinners } from './revealed.jsx';
import { createRevealClock } from './playback.js';
import { stageScene } from './stage-model.js';
import { fixtureWrit } from '../../lots-fixture.js';

type TreeProps = ButtonHTMLAttributes<HTMLButtonElement> & { columns?: readonly ReactNode[] };
function trigger(tree: ReactNode): TreeProps | undefined {
  let found: TreeProps | undefined;
  Children.forEach(tree, child => {
    if (!isValidElement<TreeProps>(child)) return;
    if (child.type === 'button' && child.props.children === 'The writ and draw tools') found = child.props;
    else found ??= trigger(child.props.children) ?? trigger(child.props.columns);
  });
  return found;
}

test.each(['fixture', 'core'] as const)('%s chamber opens the actual drawer from its section trigger and closes it', mode => {
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
    const control = trigger(frame);
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
    expect(html.match(/data-role="room-section"/g)).toHaveLength(5);
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
