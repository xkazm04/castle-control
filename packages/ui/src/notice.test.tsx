import { readFileSync } from 'node:fs';
import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { Notice, outcomeTone } from './index.js';

function regions(html: string) {
  const paragraphs = html.match(/<p\b[^>]*>[\s\S]*?<\/p>/g) ?? [];
  expect(paragraphs).toHaveLength(2);
  const status = paragraphs.filter(p => p.includes('role="status"'));
  const alert = paragraphs.filter(p => p.includes('role="alert"'));
  expect(status).toHaveLength(1);
  expect(alert).toHaveLength(1);
  expect(status[0]).toContain('aria-live="polite"');
  expect(status[0]).toContain('aria-atomic="true"');
  return { status: status[0] ?? '', alert: alert[0] ?? '' };
}

test('Notice mounts one empty polite status and one empty alert without a message', () => {
  const { status, alert } = regions(renderToStaticMarkup(<Notice />));
  expect(status).toMatch(/><\/p>$/);
  expect(alert).toMatch(/><\/p>$/);
});

test.each([
  { tone: 'polite', message: 'Sealed.' },
  { tone: 'alert', message: 'Refused' },
] as const)('Notice keeps both regions and routes $tone text only to its matching region', ({ tone, message }) => {
  const pair = regions(renderToStaticMarkup(tone === 'polite' ? <Notice message={message} /> : <Notice tone={tone} message={message} />));
  expect(pair[tone === 'polite' ? 'status' : 'alert']).toContain(`>${message}</p>`);
  expect(pair[tone === 'polite' ? 'alert' : 'status']).toMatch(/><\/p>$/);
});

test('Notice is a hook-free leaf callable outside a React render', () => {
  const element = Notice({ message: 'x' });
  expect(isValidElement(element)).toBe(true);
  expect(regions(renderToStaticMarkup(element)).status).toContain('>x</p>');
});

test('outcomeTone maps successful outcomes to polite and failures to alert', () => {
  expect(outcomeTone({ ok: true })).toBe('polite');
  expect(outcomeTone({ ok: false })).toBe('alert');
});

test('Notice applies caller labels and styles to both persistent regions', () => {
  const pair = regions(renderToStaticMarkup(<Notice label="Save result" className="save-result" message={<b>Saved</b>} />));
  for (const region of Object.values(pair)) {
    expect(region).toContain('aria-label="Save result"');
    expect(region).toContain('class="cc-notice-region save-result"');
    expect(region).not.toMatch(/hidden|display:\s*none/);
  }
  expect(pair.status).toContain('<b>Saved</b>');
  expect(pair.alert).not.toContain('Saved');
});

test('Notice empty regions collapse spacing without hiding from assistive technology in under 100 bytes', () => {
  const css = readFileSync(new URL('./primitives.css', import.meta.url), 'utf8');
  const rule = css.match(/\.cc-notice-region:empty\s*\{[^}]*\}/)?.[0] ?? '';
  expect(rule).toMatch(/margin:\s*0\s*[;}]/);
  expect(rule).toMatch(/padding:\s*0\s*[;}]/);
  expect(rule).not.toMatch(/display|visibility/);
  expect(Buffer.byteLength(rule)).toBeLessThan(100);
});

test('Public vocabulary documents Notice with both regions staying mounted and only text changing', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const vocabulary = readme.slice(readme.indexOf('### Public vocabulary'));
  expect(vocabulary).toMatch(/\| `Notice`[^\n]*both regions stay mounted[^\n]*only the text changes/);
});
