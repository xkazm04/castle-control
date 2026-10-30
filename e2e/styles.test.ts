import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { fieldStyleErrors, measureStyles } from './styles.ts';

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
  ink = 'rgb(22, 24, 29)', missing = false, unresolved = false, overflow = false }:
  { canvas?: 'opaque' | 'obs-transparent'; background?: string; font?: string;
    ink?: string; missing?: boolean; unresolved?: boolean; overflow?: boolean } = {}) {
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
    input: { names: ['--font-ui', '--ink'], surfaces: [{ name: 'simulated layer', selector: '#scene > div' }], policy: { canvas } },
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
