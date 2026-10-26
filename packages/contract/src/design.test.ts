import { expect, test } from 'vitest';
import { parseDesignPackage } from './index.js';
import { designPackage } from './generated/validators.mjs';

// Synthetic package only. Tests never load assets or execute scripts.
const properties = { x: 0, y: 10, width: 1920, height: 1080, scale: 1, opacity: 1 };
const bindings = [
  { property: 'opacity', output_range: { at_zero: 0, at_one: 1 } },
  { property: 'scale', output_range: { at_zero: 1, at_one: 2 } },
  { property: 'x', output_range: { at_zero: -10, at_one: 10 } },
  { property: 'y', output_range: { at_zero: 0, at_one: 20 } },
];
const layers = [
  { kind: 'image', asset: 'assets/simulated-frame.png', properties, bindings },
  { kind: 'shape', shape: 'rectangle', properties, bindings },
  { kind: 'text', text: 'Simulated design', properties, bindings },
  { kind: 'particle_preset', preset: 'simulated-sparks', properties, bindings },
];
const sample = { design_id: 'simulated-design', content_hash: 'a'.repeat(64),
  layers, privileges: { kind: 'data_only' } };

test('all layer kinds round-trip in order through the public contract door', () => {
  const parsed = parseDesignPackage(JSON.stringify(sample));
  expect(parsed).toEqual(sample);
  expect(parseDesignPackage(JSON.stringify(parsed))).toEqual(sample);
  expect(parsed.layers.map((layer) => layer.kind)).toEqual(['image', 'shape', 'text', 'particle_preset']);
  // Missing privileges means data-only; the boundary does not mutate input.
  const { privileges, ...defaulted } = sample;
  expect(privileges.kind).toBe('data_only');
  expect(parseDesignPackage(JSON.stringify(defaulted))).toEqual(defaulted);
  const scripted = { ...sample, privileges: { kind: 'scripts', scripts: ['scripts/simulated.js'] } };
  expect(parseDesignPackage(JSON.stringify(scripted))).toEqual(scripted);
});

test.each(['http://example.invalid/a.png', 'https://example.invalid/a.png', '//example.invalid/a',
  '/absolute.png', 'C:/a.png', 'file:///a.png', 'data:image/png;base64,AA', '../a.png',
  'assets/../a.png', 'assets/./a.png', 'assets//a.png', 'assets\\a.png', 'assets/%2e%2e/a.png',
  'a.png?host=remote', 'a.png\n', ''])('rejects nonlocal or noncanonical asset %s', (asset) => {
  const image = { ...layers[0], asset };
  expect(() => parseDesignPackage(JSON.stringify({ ...sample, layers: [image] }))).toThrow();
  expect(() => parseDesignPackage(JSON.stringify({ ...sample,
    privileges: { kind: 'scripts', scripts: [asset] } }))).toThrow();
});

test('unknown fields and present nulls fail at every record boundary', () => {
  const records = [sample, ...layers, properties, ...bindings, bindings[0]?.output_range, sample.privileges];
  for (const record of records) {
    expect(record).toBeDefined();
    const replace = (value: object): unknown => record === sample ? value
      : { ...sample, layers: layers.map((layer) => record === layer ? value : { ...layer,
        properties: record === properties ? value : properties,
        bindings: bindings.map((binding) => record === binding ? value : { ...binding,
          output_range: record === binding.output_range ? value : binding.output_range }) }),
      privileges: record === sample.privileges ? value : sample.privileges };
    for (const key of [...Object.keys(record ?? {}), 'extra']) {
      expect(designPackage(replace({ ...record, [key]: null }))).toBe(false);
    }
    expect(designPackage(replace({ ...record, extra: true }))).toBe(false);
  }
});

test('script content requires the explicit scripts privilege variant', () => {
  for (const privileges of [{ kind: 'data_only', scripts: ['a.js'] }, { kind: 'scripts' },
    { kind: 'scripts', scripts: [] }, { kind: 'unknown' }, { scripts: ['a.js'] }, null]) {
    expect(designPackage({ ...sample, privileges })).toBe(false);
  }
  expect(designPackage({ ...sample, scripts: ['a.js'] })).toBe(false);
  for (const layer of layers) {
    expect(designPackage({ ...sample, layers: [{ ...layer, script: 'simulated.js' }] })).toBe(false);
  }
  expect(designPackage({ design_id: sample.design_id, content_hash: sample.content_hash,
    layers, scripts: ['a.js'] })).toBe(false);
});

test('closed kinds, dimensions, fractions and finite ranges match Rust', () => {
  for (const layer of [{ ...layers[0], kind: 'video' }, { ...layers[1], shape: 'arbitrary' },
    { ...layers[2], text: ' \n' }, { ...layers[3], preset: ' \t' }]) {
    expect(designPackage({ ...sample, layers: [layer] })).toBe(false);
  }
  expect(designPackage({ ...sample, layers: [] })).toBe(false);
  expect(designPackage({ ...sample, design_id: 'Bad Id' })).toBe(false);
  for (const content_hash of ['A'.repeat(64), 'a'.repeat(63), `${'a'.repeat(64)}\n`]) {
    expect(designPackage({ ...sample, content_hash })).toBe(false);
  }
  for (const width of [0, -1, 0.5, 4294967296, '1920', NaN, Infinity]) {
    expect(designPackage({ ...sample, layers: [{ ...layers[0], properties: { ...properties, width } }] })).toBe(false);
  }
  for (const property of ['opacity', 'scale', 'x', 'y', 'arbitrary_css']) {
    for (const value of [NaN, Infinity, -Infinity, '1', null]) {
      const binding = { property, output_range: { at_zero: 0, at_one: value } };
      expect(designPackage({ ...sample, layers: [{ ...layers[0], bindings: [binding] }] })).toBe(false);
    }
  }
  for (const [property, value] of [['opacity', -0.01], ['opacity', 1.01], ['scale', -1]]) {
    for (const endpoint of ['at_zero', 'at_one']) {
      const binding = { property, output_range: { at_zero: 0, at_one: 1, [endpoint]: value } };
      expect(designPackage({ ...sample, layers: [{ ...layers[0], bindings: [binding] }] })).toBe(false);
    }
  }
  for (const [property, value] of [['x', NaN], ['y', Infinity], ['scale', -1], ['opacity', 1.01]]) {
    expect(designPackage({ ...sample, layers: [{ ...layers[0],
      properties: { ...properties, [String(property)]: value } }] })).toBe(false);
  }
  expect(() => parseDesignPackage('null')).toThrow();
  expect(() => parseDesignPackage('{')).toThrow();
});
