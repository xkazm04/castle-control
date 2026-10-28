import type { ChangeEvent, FormEvent } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { StewardBar } from './steward-bar.jsx';

test('StewardBar renders one honest input, last message, speech control and suggestions', () => {
  const props = { message: 'No changes made.', value: '', suggestions: ['Catch me up'],
    on_change: vi.fn(), on_tell: vi.fn(), on_suggest: vi.fn() };
  const html = renderToStaticMarkup(<StewardBar {...props} />);
  for (const text of ['SIMULATED STEWARD · SAMPLE DATA', 'Talk to the Steward...', 'No changes made.', 'Hold to speak', 'Tell', 'Catch me up']) expect(html).toContain(text);
  expect(html.match(/<input/g)).toHaveLength(1);
  expect(html).toContain('disabled=""');
  expect(html).toContain('aria-label="Steward identity"');
  expect(html).toContain('<svg');
  expect(html).toContain('Simulated co-pilot');
  expect(html).not.toContain('aria-label="Steward proposal"');
});

test('StewardBar accepts an owner-supplied identity and proposal without owning their state', () => {
  const props = { message: 'Draft ready.', value: '', suggestions: [],
    on_change: vi.fn(), on_tell: vi.fn(), on_suggest: vi.fn() };
  const html = renderToStaticMarkup(<StewardBar {...props}
    identity={{ name: 'The Steward', state: 'Awaiting your seal', figure: <svg aria-hidden="true" data-owner-figure /> }}
    proposal={<article aria-label="Question draw proposal"><p>PROPOSAL · AWAITING YOUR SEAL</p><button type="button">Review in the room</button></article>} />);
  for (const text of ['Awaiting your seal', 'data-owner-figure', 'SIMULATED STEWARD · SAMPLE DATA',
    'aria-label="Steward proposal"', 'Question draw proposal', 'Review in the room']) expect(html).toContain(text);
  expect(html.match(/<input/g)).toHaveLength(1);
  expect(props.on_tell).not.toHaveBeenCalled();
  expect(renderToStaticMarkup(<StewardBar {...props} proposal={null} />)).not.toContain('cc-steward-proposal');
});

test('StewardBar labels an explicitly live engine without sample or simulated claims', () => {
  const html = renderToStaticMarkup(<StewardBar mode="live" message="Awaiting your seal." value="" suggestions={[]}
    on_change={vi.fn()} on_tell={vi.fn()} on_suggest={vi.fn()} />);
  expect(html).toContain('LIVE STEWARD');
  expect(html).toContain('Live co-pilot');
  expect(html).not.toMatch(/simulated|sample data/i);
});

test('StewardBar sends input and suggestion callbacks, ignores empty submissions and never calls an engine', () => {
  const tell = vi.fn(); const change = vi.fn(); const suggest = vi.fn();
  const props = { message: '', value: 'Draft a draw', suggestions: ['Catch me up'], on_change: change, on_tell: tell, on_suggest: suggest };
  const tree = StewardBar(props);
  const controls = tree.props.children[1];
  const form = controls.props.children[1];
  form.props.children[0].props.children[1].props.onChange(Object.assign({} as ChangeEvent<HTMLInputElement>, { currentTarget: { value: 'Amend' } }));
  expect(change).toHaveBeenCalledWith('Amend');
  form.props.onSubmit(Object.assign({} as FormEvent<HTMLFormElement>, { preventDefault: vi.fn() }));
  expect(tell).toHaveBeenCalledOnce();
  controls.props.children[2].props.children[0].props.onClick();
  expect(suggest).toHaveBeenCalledWith('Catch me up');
  StewardBar({ ...props, value: '  ' }).props.children[1].props.children[1].props.onSubmit({ preventDefault: vi.fn() });
  expect(tell).toHaveBeenCalledOnce();
});
