import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { ProposalCard } from './proposal-card.jsx';
import { ProposalQueue } from './steward/queue.js';
import { SimulatedSteward } from './steward/simulated.js';

test('proposal card strikes old values, re-inks amendments and exposes the focused tear target', async () => {
  const queue = new ProposalQueue(); const steward = new SimulatedSteward(queue);
  await steward.ask('draft a question draw', { surface: 'overview' });
  await steward.ask('make it 5 winners', { surface: 'overview' });
  const proposal = queue.pending()[0];
  if (!proposal) throw new Error('Missing sample proposal');
  const tear = vi.fn(); const seal = vi.fn();
  const props = { proposal, focused: true, on_seal: seal, on_tear: tear };
  const html = renderToStaticMarkup(<ProposalCard {...props} />);
  for (const text of ['PROPOSAL · AWAITING YOUR SEAL', '<s>3</s>', 'cc-proposal-reink', '>5</span>', 'data-proposal-focused="true"', 'data-tear-proposal', 'Hold to seal']) expect(html).toContain(text);
  const tree = ProposalCard(props);
  tree.props.children.at(-1).props.children[1].props.onClick();
  expect(tear).toHaveBeenCalledOnce();
  expect(seal).not.toHaveBeenCalled();
  const proclaim = renderToStaticMarkup(<ProposalCard {...props} proposal={{ ...proposal, kind: 'proclaim' }} />);
  expect(proclaim).toContain('Hold to seal and proclaim');
});
