import { expect, test } from 'vitest';
import { CHAMBERS, headline, principles, releases, stewardCopy, words } from './copy.ts';
import { nextTheme } from './theme.ts';

test('copy contains every honesty label and the release destination', () => {
  const copy = [Object.values(words).join(' '), ...stewardCopy.notices.map((notice) => notice.text)].join(' ');
  for (const label of ['Stylised illustration', 'drawn, not captured', 'Sample data', 'Fictional channel', 'invented numbers',
    'working name', 'Not affiliated with or endorsed by Twitch', 'In development', 'check releases', 'signing status',
    'Public Extension availability awaits Twitch approval and review']) expect(copy).toContain(label);
  expect(releases).toBe('https://github.com/xkazm04/castle-control/releases');
  expect(principles).toHaveLength(6);
  expect(CHAMBERS.map((item) => item.notes.length)).toEqual([4, 4, 4, 4]);
  expect(stewardCopy.title).toBe('Built in the open');
  expect(stewardCopy.links).toEqual([
    { text: 'Docs', href: 'https://github.com/xkazm04/castle-control/tree/main/docs' },
    { text: 'Source', href: 'https://github.com/xkazm04/castle-control' },
  ]);
});

test('room attention takes over the headline; leaving restores the keep', () => {
  for (const item of CHAMBERS) {
    expect(headline(item.id)).toEqual({ eyebrow: `Chamber ${item.n} of 4 · ${item.fn} · press ${item.n} or click to walk in`,
      name: item.name, sub: item.line, ink: item.ink });
  }
  expect(headline(null)).toEqual({ eyebrow: words.eyebrow, name: words.name, sub: words.sub, ink: 'key' });
  expect(headline('steward').name).toBe('Before the gates');
});

test('both existing visit-only themes remain selectable', () => {
  expect(nextTheme('paper')).toBe('stock');
  expect(nextTheme('stock')).toBe('paper');
});
