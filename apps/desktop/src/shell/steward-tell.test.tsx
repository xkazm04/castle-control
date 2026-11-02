import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import type { UnmatchedReply } from '@castle-control/ui/steward-flow';
import { ShellSteward, stewardConversation } from './steward.jsx';

afterEach(() => vi.restoreAllMocks());

// The dock owns the typed text now; the shell answers what no flow matched through on_unmatched.
function dockProps(on_select: () => void) {
  let dock: React.ReactElement<{ on_unmatched: (text: string) => Promise<UnmatchedReply> }> | undefined;
  function Probe() {
    const element = ShellSteward({ context: 'lottery', on_select, on_open: vi.fn(), on_overview: vi.fn() });
    if (React.isValidElement<NonNullable<typeof dock>['props']>(element)) dock = element;
    return null;
  }
  renderToStaticMarkup(<Probe />);
  if (!dock) throw new Error('Missing steward dock');
  return dock.props;
}

test('a throwing route leaves the Steward usable and still answers', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(stewardConversation, 'ask').mockResolvedValue({ reply: 'Simulated reply', proposals: [], focus: { chamber: 'lottery' } });
  const props = dockProps(() => { throw new Error('Synthetic navigation failure'); });
  const answer = await props.on_unmatched('Draft a question draw');
  expect(answer.reply).toBe('Simulated reply');
  expect(error).toHaveBeenCalled();
});
