import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { inkEdgeFilter, stampKinds, stampParts, stampTable } from './table.js';

test('the stamp table is total and each entry carries the complete fixed specification', () => {
  expect(stampKinds).toEqual(['sample', 'simulated', 'shadow', 'armed', 'on-air', 'off-air', 'sealed', 'draft', 'held', 'pass', 'blocked', 'ok']);
  expect(Object.keys(stampTable)).toEqual([...stampKinds]);
  for (const kind of stampKinds) {
    const spec = stampTable[kind];
    expect(Object.keys(spec).sort()).toEqual(['dot', 'fill', 'ink', 'label', 'rule', 'tilt', 'word']);
    expect(spec.word.trim()).not.toBe('');
    expect(spec.label.trim()).not.toBe('');
    expect(['key', 'gules', 'azure', 'or']).toContain(spec.ink);
    expect(['outline', 'solid']).toContain(spec.fill);
    expect(['solid', 'dashed']).toContain(spec.rule);
    expect(['none', 'lamp', 'ring', 'seal']).toContain(spec.dot);
    expect(Number.isFinite(spec.tilt)).toBe(true);
  }
});

test('winner words, descriptions and tilts retain their exact meanings', () => {
  expect(stampKinds.map(kind => {
    const { word, label, tilt } = stampTable[kind];
    return [kind, word, label, tilt];
  })).toEqual([
    ['sample', 'Sample', 'Sample data', -2],
    ['simulated', 'Simulated', 'Simulated', 1.5],
    ['shadow', 'Shadow', 'Shadow: watching, takes no action', -1],
    ['armed', 'Armed', 'Armed: can act on viewers', 2],
    ['on-air', 'On air', 'On air', -1.5],
    ['off-air', 'On air · simulated', 'On air is simulated: nothing is broadcast', -1.5],
    ['sealed', 'Sealed', 'Sealed by the streamer', -4],
    ['draft', 'Draft · not on air', 'Draft, not on air', 1],
    ['held', 'Held · not on air', 'Held for review, not on air', -2.5],
    ['pass', 'Pass', 'Pass', 1],
    ['blocked', 'Blocked', 'Blocked', 2.5],
    ['ok', 'OK', 'Allowed', -1],
  ]);
});

test.each(stampKinds)('%s parts preserve default words and append only different custom words to aria', kind => {
  const spec = stampTable[kind];
  expect(stampParts(kind)).toEqual({
    className: 'cc-stamp', dataset: { stamp: kind }, ariaLabel: spec.label, word: spec.word, dot: spec.dot,
  });
  expect(stampParts(kind, spec.word).ariaLabel).toBe(spec.label);
  expect(stampParts(kind, 'Simulated example')).toEqual({
    className: 'cc-stamp', dataset: { stamp: kind }, ariaLabel: `${spec.label}: Simulated example`,
    word: 'Simulated example', dot: spec.dot,
  });
  for (const word of ['', ' ', '\n\t']) expect(() => stampParts(kind, word)).toThrow('word');
});

test('fixed inks distinguish acting, watching, samples and the streamer seal', () => {
  for (const kind of ['armed', 'on-air'] as const) expect(stampTable[kind]).toMatchObject({ ink: 'gules', fill: 'solid' });
  for (const kind of ['shadow', 'pass'] as const) expect(stampTable[kind]).toMatchObject({ ink: 'azure', fill: 'outline' });
  for (const kind of ['sample', 'simulated', 'ok'] as const) expect(stampTable[kind]).toMatchObject({ ink: 'key', fill: 'outline' });
  expect(stampTable.sealed).toMatchObject({ ink: 'key', fill: 'solid', dot: 'seal' });
  expect(stampKinds.filter(kind => stampTable[kind].rule === 'dashed')).toEqual(['simulated', 'draft']);
  expect(stampKinds.filter(kind => stampTable[kind].dot !== 'none')).toEqual(['on-air', 'off-air', 'sealed']);
});

test('the standalone site entry has no framework, stylesheet or DOM dependency', () => {
  const source = readFileSync(new URL('./table.ts', import.meta.url), 'utf8');
  expect(source).not.toMatch(/^\s*import\b|\b(?:document|window|React)\b/m);
  expect(inkEdgeFilter).toEqual({
    id: 'inkedge', x: '-5%', y: '-10%', width: '110%', height: '120%',
    turbulence: { type: 'fractalNoise', baseFrequency: '.85', numOctaves: '2', seed: '7' },
    displacement: { in: 'SourceGraphic', scale: '1.8', xChannelSelector: 'R', yChannelSelector: 'G' },
  });
});
