import { expect, test } from 'vitest';
import { presetCatalog, defaultPreset } from './catalog.js';
import { validateDesignOutput } from './schema.js';

const valid = defaultPreset('urn').output;
test.each([
  ['null', null], ['absent', undefined], ['array', []],
  ['not simulated', { ...valid, simulated: false }],
  ['code frame', { kind: 'isolated_code', html: '<p>Fixture</p>', css: '', javascript: '' }],
  ['unknown field', { ...valid, permissions: 'moderator' }],
  ['unknown nested field', { ...valid, scene: { ...valid.scene, script: 'fixture' } }],
  ['wrong artifact scene', { ...valid, scene: { shape: 'hex-map' } }],
  ['null style', { ...valid, style: null }],
  ['raw color', { ...valid, style: { ...valid.style, ink: '#abcdef' } }],
  ['remote resource', { ...valid, style: { ...valid.style, ink: 'url(https://example.test)' } }],
  ['arbitrary style', { ...valid, style: { ...valid.style, treatment: 'position:fixed' } }],
  ['unbounded density', { ...valid, style: { ...valid.style, density: Infinity } }],
])('the single schema door rejects %s', (_name, output) => {
  expect(validateDesignOutput(output, 'urn').ok).toBe(false);
});

test.each(presetCatalog)('the $id fixture passes the same boundary', preset => {
  expect(validateDesignOutput(preset.output, preset.artifact)).toEqual({ ok: true, output: preset.output });
});
