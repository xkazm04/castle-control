import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { typeTokens } from './source.js';
import { winnerFonts } from './winner-reference.js';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const rows = [...read('../TYPE-FLOOR.md').matchAll(/^\| `([^`]+)` \| ([\d.]+) \| `--([\w-]+)` \| ([\d.]+) \| (yes|no) \|$/gm)];

test('the floor ledger covers every winner font declaration, including inline and SVG sizes', () => {
  expect(rows).toHaveLength(112);
  const actual = rows.map(row => {
    const location = row[1] ?? '';
    const inline = /^[\w.]+:\d+/.exec(location)?.[0];
    const scope = row[3]?.startsWith('text-stage-') ? 'stage' : 'shell';
    return `${inline ?? location}|${row[2]}|${scope}`;
  }).sort();
  expect(actual).toEqual([...winnerFonts].sort());
  expect(rows.filter(row => row[5] === 'yes')).toHaveLength(33);
  expect(new Set(rows.map(row => row[3]))).toEqual(new Set(Object.keys(typeTokens)));
});

test('stage and shell type obey their floors and unchanged winner sizes remain byte-equal', () => {
  for (const [name, value] of Object.entries(typeTokens)) {
    expect(value).toMatch(/^\d+(?:\.\d+)?px$/);
    expect(Number.parseFloat(value)).toBeGreaterThanOrEqual(name.startsWith('text-stage-') ? 15 : 13);
    if (name.includes('-body')) expect(Number.parseFloat(value)).toBeGreaterThanOrEqual(name.startsWith('text-stage-') ? 17 : 15);
  }
  for (const [, , winner, name, port, raised] of rows) {
    if (!name || !winner || !port) throw new Error('Incomplete type-floor row');
    expect((typeTokens as Readonly<Record<string, string>>)[name]).toBe(`${port}px`);
    expect(raised).toBe(Number(port) > Number(winner) ? 'yes' : 'no');
    const floor = name.startsWith('text-stage-') ? (name.includes('-body') ? 17 : 15) : (name.includes('-body') ? 15 : 13);
    expect(Number(port)).toBe(Math.max(Number(winner), floor));
    if (raised === 'no') expect(Buffer.from(`${port}px`)).toEqual(Buffer.from(`${winner}px`));
  }
});
