import type { ChangeEvent, FormEvent } from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { StewardBar } from './steward-bar.jsx';
import { ThemeFrame } from './primitives.jsx';
import { Stamp } from './stamp/stamp.jsx';
import { stampTable } from './stamp/table.js';

test.each(['paper', 'stock'] as const)('Steward identity leaves stamp ink and size to the stamp table on %s', theme => {
  const html = renderToStaticMarkup(<ThemeFrame theme={theme}><StewardBar message="Simulated example." value="" suggestions={[]}
    on_change={vi.fn()} on_tell={vi.fn()} on_suggest={vi.fn()}
    identity={{ name: 'The Steward', state: 'Watching', figure: <Stamp kind="shadow" word="Watching" /> }} /></ThemeFrame>);
  expect(html).toContain('data-stamp="shadow" role="img" aria-label="Shadow: watching, takes no action: Watching"');
  expect(html).toContain('data-stamp="simulated" role="img" aria-label="Simulated"');
  expect(html).toContain('<span class="cc-steward-state">Watching · sample data</span>');
  const css = readFileSync(new URL('./steward-bar.css', import.meta.url), 'utf8');
  const identityTextRules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, selector, body]) =>
    /cc-steward-(?:identity|name|state|mode)/.test(selector ?? '')
    && /(?:^|;)\s*(?:color|font[\w-]*|--stamp[\w-]*)\s*:/.test(body ?? ''));
  // Every identity text rule must opt into its own leaf class, so neither the
  // stamp container nor its decorative word can inherit an identity override.
  expect(identityTextRules.map(([, selector]) => selector?.trim()).sort()).toEqual([
    '.cc-steward-mode', '.cc-steward-name', '.cc-steward-state',
  ]);
  const stampCss = readFileSync(new URL('./stamp/stamp.css', import.meta.url), 'utf8');
  const base = stampCss.match(/\.cc-stamp:where\(:not\(\.cc-chip\)\)\s*\{([^}]*)\}/)?.[1];
  expect(base).toContain('font-size: var(--stamp-size, var(--text-shell-stamp))');
  expect(base).toContain('color: var(--stamp-ink)');
  for (const kind of ['simulated', 'shadow'] as const) {
    const ink = stampTable[kind].ink;
    const token = ink === 'key' ? 'ink' : `${ink}-text`;
    const rule = stampCss.split('\n').find(line => line.includes(`[data-stamp="${kind}"]`));
    expect(rule).toContain(`--stamp-ink: var(--${token})`);
  }
});

test('StewardBar renders one honest input, last message and suggestions without a speech button when handlers are absent', () => {
  const props = { message: 'No changes made.', value: '', suggestions: ['Catch me up'],
    on_change: vi.fn(), on_tell: vi.fn(), on_suggest: vi.fn() };
  const html = renderToStaticMarkup(<StewardBar {...props} />);
  for (const text of ['Simulated', 'sample data', 'Talk to the Steward...', 'No changes made.', 'Tell', 'Catch me up']) expect(html).toContain(text);
  expect(html).not.toContain('Hold to speak');
  expect(html.match(/<input/g)).toHaveLength(1);
  expect(html).toContain('disabled=""');
  expect(html).toContain('aria-label="Steward identity"');
  expect(html).toContain('<svg');
  expect(html).toContain('<span class="cc-steward-state">simulated co-pilot · sample data</span>');
  expect(html).toContain(renderToStaticMarkup(<Stamp kind="simulated" />));
  expect(html).not.toContain('SIMULATED STEWARD');
  expect(html).toContain('data-stamp="simulated" role="img" aria-label="Simulated"');
  expect(html).not.toContain('aria-label="Steward proposal"');
});

test('StewardBar renders an enabled speech button when both handlers are provided', () => {
  const html = renderToStaticMarkup(<StewardBar message="No changes made." value="" suggestions={[]}
    on_change={vi.fn()} on_tell={vi.fn()} on_suggest={vi.fn()}
    on_speak_start={vi.fn()} on_speak_end={vi.fn()} />);
  const speech_button = html.match(/<button\b[^>]*>Hold to speak<\/button>/)?.[0];
  expect(speech_button).toBeDefined();
  expect(speech_button).not.toContain('disabled');
  expect(html).not.toContain('Speech input is not wired yet');
});

test.each(['start', 'end'] as const)('StewardBar hides speech when only the %s handler is provided', handler => {
  const speech = handler === 'start' ? { on_speak_start: vi.fn() } : { on_speak_end: vi.fn() };
  const html = renderToStaticMarkup(<StewardBar message="No changes made." value="" suggestions={[]}
    on_change={vi.fn()} on_tell={vi.fn()} on_suggest={vi.fn()} {...speech} />);
  expect(html).not.toContain('Hold to speak');
});

test('StewardBar accepts an owner-supplied identity and proposal without owning their state', () => {
  const props = { message: 'Draft ready.', value: '', suggestions: [],
    on_change: vi.fn(), on_tell: vi.fn(), on_suggest: vi.fn() };
  const html = renderToStaticMarkup(<StewardBar {...props}
    identity={{ name: 'The Steward', state: 'Awaiting your seal', figure: <svg aria-hidden="true" data-owner-figure /> }}
    proposal={<article aria-label="Question draw proposal"><p>PROPOSAL · AWAITING YOUR SEAL</p><button type="button">Review in the room</button></article>} />);
  for (const text of ['Awaiting your seal', 'data-owner-figure', 'Simulated', 'sample data',
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
