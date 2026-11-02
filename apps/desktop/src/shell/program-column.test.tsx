import { Children, isValidElement, useState } from 'react';
import type { KeyboardEvent, ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { proposalQueue, SimulatedSteward } from '@castle-control/ui/steward';
import KeepWorkspace from './keep.jsx';
import { ProgramColumn } from './program-column.jsx';
import { simulatedRead } from '../simulated.js';

const snapshot = { mode: 'fixture', phase: 'ready', ...simulatedRead(1) } as const;
beforeEach(() => { for (const proposal of proposalQueue.pending()) proposalQueue.tearUp(proposal.id); });
afterEach(() => { vi.restoreAllMocks(); });

type ButtonProps = { children?: ReactNode; onClick?: () => void };
function findButton(node: ReactNode, label: string): ReactElement<ButtonProps> | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<ButtonProps>(child)) continue;
    if (child.type === 'button' && renderToStaticMarkup(child).includes(label)) return child;
    const nested = findButton(child.props.children, label);
    if (nested) return nested;
  }
  return undefined;
}

test('one sill retains entry paths, Preview, the hold, Program and the labelled moat, with no Steward', () => {
  const html = renderToStaticMarkup(<KeepWorkspace snapshot={snapshot} on_open={vi.fn()} on_enter={vi.fn()}
    on_demo={vi.fn()} on_stream={vi.fn()} on_rehearsal={vi.fn()} />);
  const sill = html.slice(html.indexOf('data-role="keep-sill"'));
  for (const label of ['See it on stream', 'Set up OBS', 'Dress rehearsal', 'Preview', 'Drafts only',
    'Hold to seal and proclaim', 'Program', 'Simulated program', 'The moat', 'Sample replay · simulated', 'Watch the full replay']) {
    expect(sill).toContain(label);
  }
  expect(html).not.toContain('cc-steward-dock');
  expect(sill.indexOf('monitor-preview')).toBeLessThan(sill.indexOf('data-role="seal"'));
  expect(sill.indexOf('data-role="seal"')).toBeLessThan(sill.indexOf('monitor-program'));
});

test.each(['preview', 'program'] as const)('%s detail preserves the full content and Escape closes only that layer', async detail => {
  const proposal = (await new SimulatedSteward().ask('draft a question draw', { surface: 'keep' })).proposals[0];
  if (!proposal) throw new Error('Missing simulated proposal');
  const trees: ReactNode[] = [];
  const prevented = vi.fn();
  function Journey() {
    const [step, next] = useState(0);
    const tree = ProgramColumn({ snapshot, selected: 'lottery' });
    trees.push(tree);
    if (step === 0) {
      const button = findButton(tree, detail === 'preview' ? 'Review drafts' : 'View program picture');
      if (!button?.props.onClick) throw new Error('Missing detail opener');
      button.props.onClick(); next(1);
    }
    if (step === 1) {
      tree.props.onKeyDown(Object.assign({} as KeyboardEvent<HTMLElement>, {
        key: 'Escape', nativeEvent: { isComposing: false }, preventDefault: prevented,
      }));
      next(2);
    }
    return tree;
  }
  renderToStaticMarkup(<Journey />);
  const opened = renderToStaticMarkup(trees[1]);
  expect(opened).toContain('role="dialog"');
  if (detail === 'preview') {
    expect(opened).toContain(proposal.title);
    for (const field of proposal.fields) expect(opened).toContain(`${field.label}: ${String(field.value)}`);
  } else expect(opened).toContain('class="overview-scene" data-scene="program"');
  expect(prevented).toHaveBeenCalledOnce();
  expect(renderToStaticMarkup(trees.at(-1))).not.toContain('role="dialog"');
  expect(proposalQueue.pending()).toContain(proposal);
});
