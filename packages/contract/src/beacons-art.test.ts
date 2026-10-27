import { expect, test } from 'vitest';
import { beaconsArtStatus, beaconsArtGenerate } from './generated/beacons-validation.js';
import { parseMethodParams, parseMethodResult } from './index.js';

// Generated simulated data only; no real assets, credentials, or network calls.
const params = { design_id: 'simulated-design', prompt: 'A simulated gold frame',
  model_id: 'simulated-model', width: 512, height: 768, quantity: 1, remove_background: true };
const asset = { asset: 'assets/simulated-frame.png', generated: true, provenance: 'leonardo_background_removed' };
const cost = { call_id: '01ARZ3NDEKTSV4RRFFQ69G5FAV', model: 'simulated-model', charge: { credits: '1.250000' } };
const result = { design_id: 'simulated-design', assets: [asset], costs: [cost] };

test('lazy art handles round-trip availability, anchor, matching set and local imported assets', () => {
  expect(beaconsArtStatus.method).toBe('beacons.art.status');
  expect(beaconsArtGenerate.method).toBe('beacons.art.generate');
  expect(parseMethodParams(beaconsArtStatus, {})).toEqual({});
  for (const available of [false, true]) {
    expect(parseMethodResult(beaconsArtStatus, JSON.stringify({ available }))).toEqual({ available });
  }
  for (const input of [params, { ...params, reference: 'assets/simulated-anchor.png', quantity: 8 }]) {
    expect(parseMethodParams(beaconsArtGenerate, input)).toEqual(input);
    expect(parseMethodResult(beaconsArtGenerate, JSON.stringify(result))).toEqual(result);
  }
  expect(parseMethodParams(beaconsArtGenerate, params)).not.toHaveProperty('reference');
  expect(parseMethodResult(beaconsArtGenerate, JSON.stringify({ ...result, assets: [] })).assets).toEqual([]);
  const dollar = { ...result, costs: [{ ...cost, model: 'remove-bg', charge: { micro_usd: 1234567 } }] };
  expect(parseMethodResult(beaconsArtGenerate, JSON.stringify(dollar))).toEqual(dollar);
  for (const charge of [{ credits: '0' }, { credits: '999999999999.999999' },
    { micro_usd: 0 }, { micro_usd: 9007199254740991 }]) {
    const output = { ...result, costs: [{ ...cost, charge }] };
    expect(parseMethodResult(beaconsArtGenerate, JSON.stringify(output))).toEqual(output);
  }
});

test('art records reject unknown fields, present null and caller-supplied privacy or key labels', () => {
  for (const key of [...Object.keys(params), 'reference', 'extra', 'public', 'key_label']) {
    expect(() => parseMethodParams(beaconsArtGenerate, { ...params, [key]: null })).toThrow();
  }
  for (const value of [true, false]) {
    expect(() => parseMethodParams(beaconsArtGenerate, { ...params, public: value })).toThrow();
  }
  for (const value of [{ available: false, key_label: 'simulated-label' }, { available: null },
    { available: true, extra: true }]) {
    expect(() => parseMethodResult(beaconsArtStatus, JSON.stringify(value))).toThrow();
  }
  expect(() => parseMethodParams(beaconsArtStatus, { extra: true })).toThrow();
  for (const key of [...Object.keys(result), 'extra']) {
    expect(() => parseMethodResult(beaconsArtGenerate, JSON.stringify({ ...result, [key]: null }))).toThrow();
  }
  for (const value of [{ ...asset, extra: true }, { ...asset, generated: false },
    { ...asset, generated: null }, { ...asset, provenance: 'unknown' }]) {
    expect(() => parseMethodResult(beaconsArtGenerate, JSON.stringify({ ...result, assets: [value] }))).toThrow();
  }
  for (const value of [{ ...cost, extra: true }, { ...cost, charge: null }, { ...cost, call_id: null }]) {
    expect(() => parseMethodResult(beaconsArtGenerate, JSON.stringify({ ...result, costs: [value] }))).toThrow();
  }
  for (const key of Object.keys(asset)) {
    expect(() => parseMethodResult(beaconsArtGenerate,
      JSON.stringify({ ...result, assets: [{ ...asset, [key]: null }] }))).toThrow();
  }
  for (const key of Object.keys(cost)) {
    expect(() => parseMethodResult(beaconsArtGenerate,
      JSON.stringify({ ...result, costs: [{ ...cost, [key]: null }] }))).toThrow();
  }
});

test('art inputs and outputs reject remote URLs in every local asset path', () => {
  for (const path of ['https://example.invalid/generated.png', 'http://localhost:4312/image.png',
    '//example.invalid/a.png', 'data:image/png;base64,AAAA', '../a.png', '/a.png',
    'assets/%2e%2e/a.png', 'assets\\a.png', 'assets/a.png?x=1', 'assets/a.png#x']) {
    expect(() => parseMethodParams(beaconsArtGenerate, { ...params, reference: path })).toThrow();
    expect(() => parseMethodResult(beaconsArtGenerate,
      JSON.stringify({ ...result, assets: [{ ...asset, asset: path }] }))).toThrow();
  }
  for (const design_id of ['', 'Bad Id', 'bad--slug', 'trailing-', 'simulated\n']) {
    expect(() => parseMethodParams(beaconsArtGenerate, { ...params, design_id })).toThrow();
  }
});

test('art scalar domains preserve provider limits and exact cost receipts', () => {
  for (const bad of [{ prompt: ' \n\t' }, { prompt: '\u0085' }, { prompt: 'x'.repeat(1501) },
    { model_id: 'https://example.invalid/model' }, { model_id: 'x'.repeat(129) },
    { width: 31 }, { width: 33 }, { height: 1544 }, { quantity: 0 }, { quantity: 9 }, { quantity: 2 }]) {
    expect(() => parseMethodParams(beaconsArtGenerate, { ...params, ...bad })).toThrow();
  }
  expect(parseMethodParams(beaconsArtGenerate, { ...params, prompt: '🔥'.repeat(1500) })).toBeDefined();
  expect(parseMethodParams(beaconsArtGenerate, { ...params, prompt: '\uFEFF' })).toBeDefined();
  for (const charge of [{ credits: '-1' }, { credits: '1.' }, { credits: '1.0000001' },
    { credits: '1e2' }, { credits: 1 }, { credits: '1', extra: true }, { credits: '1', micro_usd: 1 },
    { micro_usd: -1 }, { micro_usd: 0.5 }, { micro_usd: 9007199254740992 }]) {
    expect(() => parseMethodResult(beaconsArtGenerate,
      JSON.stringify({ ...result, costs: [{ ...cost, charge }] }))).toThrow();
  }
  for (const call_id of ['not-a-ulid', '01arz3ndektsv4rrffq69g5fav', 'ZZZZZZZZZZZZZZZZZZZZZZZZZZ']) {
    expect(() => parseMethodResult(beaconsArtGenerate,
      JSON.stringify({ ...result, costs: [{ ...cost, call_id }] }))).toThrow();
  }
  expect(() => parseMethodResult(beaconsArtGenerate, JSON.stringify({ ...result, costs: [] }))).toThrow();
});
