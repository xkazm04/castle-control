import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { ShellSteward, stewardConversation } from './steward.jsx';

vi.mock('react', async importOriginal => ({ ...await importOriginal<typeof React>() }));
afterEach(() => vi.restoreAllMocks());

// Hook slots persist between server renders; the real handlers and conversation run.
function mountSteward(on_select: () => void) {
  const slots: unknown[] = []; let index = 0;
  vi.spyOn(React, 'useState').mockImplementation((initial?: unknown): [unknown, React.Dispatch<unknown>] => {
    const at = index++;
    if (!(at in slots)) slots[at] = typeof initial === 'function' ? initial() : initial;
    return [slots[at], next => { slots[at] = typeof next === 'function' ? next(slots[at]) : next; }];
  });
  let bar: React.ReactElement<{ value: string; identity: { state: string }; on_change: (text: string) => void; on_tell: () => void }> | undefined;
  const render = () => {
    index = 0;
    function Probe() {
      const element = ShellSteward({ context: 'lottery', on_select, on_open: vi.fn(), on_overview: vi.fn() });
      if (React.isValidElement<NonNullable<typeof bar>['props']>(element)) bar = element;
      return null;
    }
    renderToStaticMarkup(<Probe />);
    if (!bar) throw new Error('Missing steward bar');
    return bar.props;
  };
  return { render };
}

test('a throwing route leaves the Steward usable and returns the typed text', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(stewardConversation, 'ask').mockResolvedValue({ reply: 'Simulated reply', proposals: [], focus: { chamber: 'lottery' } });
  const h = mountSteward(() => { throw new Error('Synthetic navigation failure'); });
  h.render().on_change('Draft a question draw');
  expect(h.render().value).toBe('Draft a question draw');
  h.render().on_tell();
  await vi.waitFor(() => expect(h.render().identity.state).not.toBe('Drafting'));
  expect(h.render().value).toBe('Draft a question draw');
  expect(error).toHaveBeenCalled();
});
