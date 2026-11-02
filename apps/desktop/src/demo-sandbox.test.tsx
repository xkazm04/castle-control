import { afterEach, expect, test, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { proposalQueue } from '@castle-control/ui/steward';
import { createDockStore } from '@castle-control/ui/steward-flow';
import { demoSandboxOpen, sandboxLabel } from './demo-sandbox.jsx';
import { coreDemoFlow as coreLotDemo, demoFlow as lotDemo, isDemoClosing as lotClosing } from './rooms/lottery/flow-steps.js';
import { coreDemoFlow as coreGateDemo, demoFlow as gateDemo, isDemoClosing as gateClosing } from './rooms/moderator/flow-demo.jsx';
import { moderationSession } from './rooms/moderator/session.js';
import { GatePlate } from './rooms/moderator/gate.jsx';

afterEach(() => { vi.useRealTimers(); });

test('the sandbox is open while the demo is open, and on its closing beat until the streamer acts', () => {
  const dock = createDockStore();
  const open = () => demoSandboxOpen(dock.getSnapshot(), 'lottery', lotDemo.id, lotClosing);
  expect(open()).toBe(false);
  dock.open(coreLotDemo);
  expect(open()).toBe(true);
  // The demo's closing beat keeps the sandbox while the sheet stays raised.
  dock.close('lottery');
  dock.say({ chamber: 'lottery', who: 'steward', sealed: true, simulated: true, text: 'Sealed and cast. What you saw: the entries froze first.' });
  dock.expand();
  expect(open()).toBe(true);
  // Lowering the sheet, or anything said after it, returns the chamber to its own (core) view.
  dock.collapse();
  expect(open()).toBe(false);
  dock.expand();
  dock.say({ chamber: 'lottery', who: 'you', text: 'Catch me up' });
  expect(open()).toBe(false);
  expect(sandboxLabel).toBe('Demo sandbox · SIMULATED · nothing touches your core');
});

test('core demos keep their SIMULATED label and offer the core’s real flows; fixture demos keep theirs', () => {
  expect(coreLotDemo).toMatchObject({ id: lotDemo.id, simulated: true });
  expect(coreGateDemo).toMatchObject({ id: gateDemo.id, simulated: true });
  expect(gateClosing('Sealed: the sample line is released to chat.')).toBe(true);
  expect(lotClosing('Sealed on the core.')).toBe(false);
});

test('Gatehouse: after the demo the gate shows the demo’s own line, released, not another held message', async () => {
  vi.useFakeTimers();
  const { port, view } = moderationSession(proposalQueue);
  const outcome = await coreGateDemo.seal({ choice: 'pass' });
  expect(outcome.chips?.map(chip => chip.label)).toEqual(['Show the vote bar', 'Practice a drill']);
  expect(outcome.say).toContain('Your core was not touched.');
  const resolved = view.getSnapshot().demo_resolved;
  expect(resolved?.choice).toBe('pass');
  await vi.runAllTimersAsync();
  const html = renderToStaticMarkup(<GatePlate state={port.getSnapshot()} queue={proposalQueue}
    resolved={{ choice: 'pass', on_next: () => undefined }} />);
  expect(html).toContain('I wrote a boss guide, may I share the link?');
  expect(html).toContain('Released');
  expect(html).toContain('Sealed · Pass');
  expect(html).not.toContain('can I post my guide?');
  view.setDemoResolved(undefined);
});
