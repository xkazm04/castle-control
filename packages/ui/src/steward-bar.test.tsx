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
});

test('StewardBar sends input and suggestion callbacks, ignores empty submissions and never calls an engine', () => {
  const tell = vi.fn(); const change = vi.fn(); const suggest = vi.fn();
  const props = { message: '', value: 'Draft a draw', suggestions: ['Catch me up'], on_change: change, on_tell: tell, on_suggest: suggest };
  const tree = StewardBar(props);
  const form = tree.props.children[1];
  form.props.children[0].props.children[1].props.onChange(Object.assign({} as ChangeEvent<HTMLInputElement>, { currentTarget: { value: 'Amend' } }));
  expect(change).toHaveBeenCalledWith('Amend');
  form.props.onSubmit(Object.assign({} as FormEvent<HTMLFormElement>, { preventDefault: vi.fn() }));
  expect(tell).toHaveBeenCalledOnce();
  tree.props.children[2].props.children[0].props.onClick();
  expect(suggest).toHaveBeenCalledWith('Catch me up');
  StewardBar({ ...props, value: '  ' }).props.children[1].props.onSubmit({ preventDefault: vi.fn() });
  expect(tell).toHaveBeenCalledOnce();
});
