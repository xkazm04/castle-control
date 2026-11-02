import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { fieldStyleErrors, measureFields, measureStyles, strongBorderFields, styleTokenNames } from './styles.ts';
import { source, tokenInventory, tokens } from './inventory.ts';

// Only the CSS audit's DOM surface is simulated. This is policy coverage,
// not computed-browser-style or screenshot evidence.
class Element {
  tagName = 'DIV';
  className = 'simulated-layer';
  parentElement = null;
  style = { fontFamily: '', color: '' };
  checkVisibility() { return true; }
  remove() { /* The owned probe has no persistent DOM. */ }
}

function measure({ canvas = 'opaque', background = 'transparent', font = 'Segoe UI',
  ink = 'rgb(22, 24, 29)', missing = false, unresolved = false, overflow = false, names = ['--font-ui', '--ink'] }:
  { canvas?: 'opaque' | 'obs-transparent'; background?: string; font?: string;
    ink?: string; missing?: boolean; unresolved?: boolean; overflow?: boolean; names?: string[] } = {}) {
  const layer = new Element();
  const body = { append() { /* Measurement probes only. */ }, querySelectorAll: () => [layer] };
  const document = {
    body, documentElement: { scrollWidth: overflow ? 801 : 800 },
    createElement: (tag: string) => tag === 'iframe' ? {
      contentDocument: { body: {} },
      contentWindow: { getComputedStyle: () => ({ fontFamily: 'Times New Roman', color: 'rgb(0, 0, 0)' }) },
      remove() { /* The owned default document is discarded. */ },
    } : new Element(),
    querySelectorAll: () => missing ? [] : [layer], elementFromPoint: () => layer,
  };
  const getComputedStyle = (node: Element) => ({
    fontFamily: node.style?.fontFamily === 'var(--font-ui)' ? 'Segoe UI' : font,
    color: node.style?.color === 'var(--ink)' ? 'rgb(22, 24, 29)' : ink,
    backgroundColor: background, getPropertyValue: () => unresolved ? '' : 'simulated-token',
  });
  // Playwright likewise serializes this closure-free function into its page.
  return runInNewContext(`(${measureStyles.toString()})(input)`, {
    document, getComputedStyle, HTMLElement: Element, innerWidth: 800, innerHeight: 600,
    input: { names, surfaces: [{ name: 'simulated layer', selector: '#scene > div' }], policy: { canvas } },
  }) as ReturnType<typeof measureStyles>;
}

test('desktop canvas still rejects transparency and white; overlay alone allows transparency', () => {
  assert.match(measure().errors.join('\n'), /Default white canvas/);
  assert.equal(measure({ canvas: 'obs-transparent' }).errors.length, 0);
  for (const canvas of ['opaque', 'obs-transparent'] as const) {
    assert.match(measure({ canvas, background: 'rgb(255, 255, 255)' }).errors.join('\n'), /Default white canvas/);
  }
  assert.equal(measure({ background: 'rgb(244, 240, 230)' }).errors.length, 0);
});

test('transparent overlay still rejects non-token fonts, ink, unresolved tokens and missing layers', () => {
  const canvas = 'obs-transparent';
  assert.match(measure({ canvas, font: 'Arial' }).errors.join('\n'), /expected token UI font/);
  assert.match(measure({ canvas, ink: 'rgb(1, 2, 3)' }).errors.join('\n'), /expected token ink/);
  assert.match(measure({ canvas, font: 'Times New Roman' }).errors.join('\n'), /Default serif/);
  assert.match(measure({ canvas, unresolved: true }).errors.join('\n'), /Root tokens unresolved/);
  assert.match(measure({ canvas, missing: true }).errors.join('\n'), /Missing visible simulated layer/);
  assert.match(measure({ canvas, overflow: true }).errors.join('\n'), /Horizontal overflow/);
});

test('only the explicit overlay base scope audits the renderer subset; every shipped token remains required', () => {
  const canvas = 'obs-transparent';
  assert.deepEqual(styleTokenNames({ canvas: 'opaque' }), tokens);
  assert.deepEqual(styleTokenNames({ canvas: 'opaque', tokenSheet: 'overlay-base' }), tokens);
  assert.deepEqual(styleTokenNames({ canvas }), tokens);
  const base = styleTokenNames({ canvas, tokenSheet: 'overlay-base' });
  assert.deepEqual(base, tokenInventory(source('packages/tokens/src/generated-base.css')));
  assert.ok(base.length > 0 && base.length < tokens.length);
  assert.ok(base.every(name => tokens.includes(name)));
  for (const names of [tokens, base]) {
    const report = measure({ canvas, names, unresolved: true });
    assert.equal(report.tokenCount, names.length);
    assert.equal(report.errors[0], `Root tokens unresolved: ${names.join(', ')}`);
  }
});

const fieldBorder = { color: 'rgb(22, 24, 29)', style: 'solid', width: '1px' };
const kitField = { appearance: 'none', borders: Array.from({ length: 4 }, () => ({ ...fieldBorder })) };

test('field policy rejects browser chrome even when a field already has token borders', () => {
  for (const appearance of ['auto', 'menulist', 'textfield']) {
    assert.match(fieldStyleErrors({ ...kitField, appearance }, fieldBorder).join('\n'), /Browser-default field appearance/);
  }
  const chrome = { appearance: 'auto', borders: Array.from({ length: 4 }, () => ({
    color: 'rgb(118, 118, 118)', style: 'inset', width: '2px',
  })) };
  const errors = fieldStyleErrors(chrome, fieldBorder);
  assert.equal(errors.length, 5);
  assert.match(errors.join('\n'), /Field border/);
});

test('field policy accepts kit fields in paper and stock and checks every border side', () => {
  assert.deepEqual(fieldStyleErrors(kitField, fieldBorder), []);
  const stockBorder = { ...fieldBorder, color: 'rgb(242, 238, 227)' };
  assert.deepEqual(fieldStyleErrors({ appearance: 'none', borders: Array(4).fill(stockBorder) }, stockBorder), []);
  for (const side of [0, 1, 2, 3]) for (const replacement of [
    { color: 'rgb(118, 118, 118)' }, { style: 'inset' }, { style: 'none' }, { width: '2px' },
  ]) {
    const borders = kitField.borders.map((border, index) => index === side ? { ...border, ...replacement } : border);
    assert.match(fieldStyleErrors({ appearance: 'none', borders }, fieldBorder).join('\n'), new RegExp(`Field border ${side}:`));
  }
  assert.match(fieldStyleErrors({ appearance: 'none', borders: [] }, fieldBorder).join('\n'), /Missing field border sides/);
});

test('every shipped field follows the thin ink law; a named exception resolves the strong token under its own theme', () => {
  assert.deepEqual(strongBorderFields, []);
  const exceptions = [{ name: 'Example prompt', selector: '.example input[aria-label="Talk to the Steward..."]', reason: 'mechanism check' }];
  const selector = exceptions[0]?.selector;
  for (const color of [fieldBorder.color, 'rgb(242, 238, 227)']) {
    for (const isSteward of [false, true]) {
      class Field {
        tagName = 'INPUT';
        style = { border: '' };
        hidden = false;
        parentElement = { append() { /* Theme-local token probe only. */ } };
        matches(value: string) { assert.equal(value, selector); return isSteward; }
        checkVisibility() { return true; }
        getAttribute() { return isSteward ? 'Talk to the Steward...' : 'Draw name'; }
        remove() { /* Probe has no persistent DOM. */ }
      }
      const document = { querySelectorAll: () => [new Field()], createElement: () => new Field() };
      const measured = runInNewContext(`(${measureFields.toString()})(exceptions)`, {
        document, HTMLElement: Field, exceptions,
        getComputedStyle: (field: Field) => ({ borderTopColor: color, borderTopStyle: 'solid',
          borderTopWidth: field.style.border.includes('--rule-strong') ? '2px' : '1px' }),
      }) as ReturnType<typeof measureFields>;
      const expected = measured[0]?.expected;
      assert.ok(expected);
      assert.equal(expected.color, color);
      assert.equal(expected.width, isSteward ? '2px' : '1px');
      const borders = Array.from({ length: 4 }, () => ({ ...expected }));
      assert.deepEqual(fieldStyleErrors({ appearance: 'none', borders }, expected), []);
      assert.match(fieldStyleErrors({ appearance: 'auto', borders }, expected).join('\n'), /Browser-default field appearance/);
      assert.match(fieldStyleErrors({ appearance: 'none', borders: borders.slice(1) }, expected).join('\n'), /Missing field border sides/);
      for (const side of [0, 1, 2, 3]) for (const replacement of [
        { width: isSteward ? '1px' : '2px' }, { width: '3px' }, { style: 'dashed' }, { color: 'rgb(1, 2, 3)' },
      ]) {
        const changed = borders.map((border, index) => index === side ? { ...border, ...replacement } : border);
        assert.match(fieldStyleErrors({ appearance: 'none', borders: changed }, expected).join('\n'), new RegExp(`Field border ${side}:`));
      }
    }
  }
});
