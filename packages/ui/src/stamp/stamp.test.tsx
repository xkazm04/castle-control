import { renderToStaticMarkup as render } from 'react-dom/server';
import { expect, test } from 'vitest';
import { InkEdgeFilter, Stamp, ThemeFrame, stampKinds } from '../index.js';
import type { StampKind, StampProps } from '../index.js';
import { inkEdgeFilter, stampParts } from './table.js';
import Stamps from '../../kit/stamps.jsx';

test.each(stampKinds)('%s renders precisely the shared parts, with decorative children hidden', kind => {
  for (const word of [undefined, 'Simulated example']) {
    const props: StampProps = word === undefined ? { kind } : { kind, word };
    const parts = stampParts(kind, word);
    const dot = parts.dot === 'none' ? '' : `<i class="cc-stamp-dot" data-dot="${parts.dot}" aria-hidden="true"></i>`;
    expect(render(<Stamp {...props} />)).toBe(
      `<span class="${parts.className}" data-stamp="${parts.dataset.stamp}" role="img" aria-label="${parts.ariaLabel}">${dot}<span aria-hidden="true">${parts.word}</span></span>`,
    );
  }
});

test('custom words are escaped in attributes and text, and blank words fail at the component boundary', () => {
  const html = render(<Stamp kind="sample" word={'Simulated <word> & "quote"'} />);
  expect(html).toContain('aria-label="Sample data: Simulated &lt;word&gt; &amp; &quot;quote&quot;"');
  expect(html).toContain('<span aria-hidden="true">Simulated &lt;word&gt; &amp; &quot;quote&quot;</span>');
  expect(() => render(<Stamp kind="sample" word=" " />)).toThrow('word');
});

test('landing adds a bounded decorative bleed sibling while keeping the stamp meaning', () => {
  const kind: StampKind = 'on-air';
  const parts = stampParts(kind);
  const html = render(<Stamp kind={kind} land />);
  expect(html).toContain('<span class="cc-stamp-impression">');
  expect(html).toContain(`data-stamp="${parts.dataset.stamp}" data-land="" role="img" aria-label="${parts.ariaLabel}"`);
  expect(html).toContain('</span><span class="cc-stamp-bleed" data-stamp="on-air" aria-hidden="true"></span>');
  expect(html.match(/role="img"/g)).toHaveLength(1);
  expect(render(<Stamp kind={kind} land={false} />)).not.toMatch(/data-land|cc-stamp-bleed|cc-stamp-impression/);
});

test('ThemeFrame installs one zero-size ink-edge filter shared by every stamp', () => {
  const filter = render(<InkEdgeFilter />);
  expect(filter).toContain('width="0" height="0" aria-hidden="true" focusable="false"');
  expect(filter).toContain(`<filter id="${inkEdgeFilter.id}" x="-5%" y="-10%" width="110%" height="120%">`);
  expect(filter).toContain('<feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="7">');
  expect(filter).toContain('<feDisplacementMap in="SourceGraphic" scale="1.8" xChannelSelector="R" yChannelSelector="G">');
  for (const theme of ['day', 'night'] as const) {
    const html = render(<ThemeFrame theme={theme}>{stampKinds.map(kind => <Stamp kind={kind} key={kind} />)}</ThemeFrame>);
    expect(html.match(/id="inkedge"/g)).toHaveLength(1);
    expect(html).toContain(filter);
    expect(html.match(/role="img"/g)).toHaveLength(stampKinds.length);
  }
});

test('the simulated kit shows every kind once at shell size and once at stage size', () => {
  const html = render(<Stamps />);
  for (const size of ['shell', 'stage']) {
    const section = html.match(new RegExp(`<section data-size="${size}"[^>]*>(.*?)</section>`))?.[1] ?? '';
    expect(section).toContain(`${size} size`);
    expect(section.match(/class="cc-stamp"/g)).toHaveLength(stampKinds.length);
    for (const kind of stampKinds) expect(section.match(new RegExp(`data-stamp="${kind}" data-land`, 'g'))).toHaveLength(1);
  }
});
