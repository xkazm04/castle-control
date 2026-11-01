import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { renderToStaticMarkup as render } from 'react-dom/server';
import { expect, test } from 'vitest';
import { StatusChip } from './chips.jsx';

const root = new URL('../../../', import.meta.url);
const files = [
  'apps/desktop/src/rampart.tsx', 'apps/desktop/src/shell/steward-slot.tsx',
  'apps/desktop/src/overview/inspector.tsx', 'packages/ui/src/chips.tsx',
  'packages/ui/src/chips.css',
  'packages/ui/src/shell.tsx', 'packages/ui/src/shell.css', 'packages/ui/src/steward-bar.css',
  'packages/ui/src/index.ts', 'packages/ui/src/steward-bar.tsx', 'packages/ui/src/proposal-card.tsx',
];
const directories = [
  'apps/desktop/src/rooms/moderator/', 'apps/desktop/src/rooms/visuals/',
  'apps/desktop/src/stream/', 'apps/desktop/src/demo/', 'apps/desktop/src/rooms/design/',
  'packages/ui/src/design/', 'packages/ui/kit/',
];

function sources(directory: string): string[] {
  return readdirSync(new URL(directory, root), { withFileTypes: true }).flatMap(entry => {
    const path = `${directory}${entry.name}`;
    if (entry.isDirectory()) return sources(`${path}/`);
    return entry.isFile() && /\.(?:tsx?|css)$/.test(path) && !/\.test\.tsx?$/.test(path) ? [path] : [];
  });
}

test('the complete WP4b source inventory has no legacy badge callers or air/sample classes', () => {
  const inventory = [...files, ...directories.flatMap(directory => {
    const entries = sources(directory);
    expect(entries.length, directory).toBeGreaterThan(0);
    return entries;
  })];
  for (const path of inventory) {
    const source = readFileSync(new URL(path, root), 'utf8');
    expect(source, path).not.toMatch(/<StatusChip\b[^>]*\bstamp\s*=/);
    expect(source, path).not.toMatch(/\bcc-(?:air|sample)\b/);
  }
});

test('StatusChip is a plain chip and the old stamp implementation is deleted', () => {
  expect(render(<StatusChip variant="dash">Unknown</StatusChip>)).toBe('<span class="cc-chip" data-variant="dash">Unknown</span>');
  expect(existsSync(new URL('./heraldic-stamp.css', import.meta.url))).toBe(false);
  const source = readFileSync(new URL('./chips.tsx', import.meta.url), 'utf8');
  const chip = source.slice(source.indexOf('export type StatusChipProps'), source.indexOf('export const verdicts'));
  expect(chip).not.toMatch(/stamp|tone|PrintStyle|PrintInk|printStyle/);
});
