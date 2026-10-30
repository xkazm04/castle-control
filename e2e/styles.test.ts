import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { measureStyles } from './styles.ts';

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
