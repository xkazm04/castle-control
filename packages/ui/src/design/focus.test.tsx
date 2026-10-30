import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { tokens } from '@castle-control/tokens';
import { expect, test, vi } from 'vitest';
import { ProposalQueue } from '../steward/queue.js';
import { SealButton, SealControl, createSealHold, sealHoldDurationMs } from '../seal-button.jsx';
import { ArtPreviewImage, DesignFocus, DesignFocusView } from './focus.jsx';
import { artPreviewsFor, artStyleCatalog, presetCatalog } from './catalog.js';
import { DesignScene } from './scene.jsx';
import { DesignSession } from './session.js';

function setup() {
  const session = new DesignSession(new ProposalQueue());
  const result = session.draft({ action: 'custom', artifact: 'urn', prompt: 'quiet engraved' });
  if (!result.ok) throw new Error(result.reason);
  return { session, id: result.proposal.id };
}

test.each(['draw', 'urn', 'beacon', 'map', 'overlay'] as const)('%s focus renders current/draft side by side with simulated labels and native controls', artifact => {
  const session = new DesignSession(new ProposalQueue());
  const html = renderToStaticMarkup(<DesignFocus artifact={artifact} session={session} />);
  for (const text of ['SIMULATED', 'Current look', 'Draft look', 'NOT ON AIR', 'Restyle', 'Custom design', '<select', '<input', 'cc-design-comparison']) {
    expect(html).toContain(text);
  }
  expect(html).not.toContain('\u2014');
  expect(html).not.toContain('iframe');
  session.dispose();
});

test.each(['draw', 'urn', 'beacon', 'map', 'overlay'] as const)('%s art gallery is labelled, accessible and display-only', artifact => {
  const session = new DesignSession(new ProposalQueue());
  const before = session.getSnapshot();
  const html = renderToStaticMarkup(<DesignFocus artifact={artifact} session={session} />);
  expect(html).toContain('aria-label="Art styles"');
  expect(html).toContain('Art styles');
  expect(html).toContain('SIMULATED');
  const figures = html.match(/<figure\b[\s\S]*?<\/figure>/g) ?? [];
  expect(figures).toHaveLength(6);
  for (const [index, preview] of artPreviewsFor(artifact).entries()) {
    const figure = figures[index] ?? '';
    expect(figure).toContain('SAMPLE ART');
    expect(figure).toContain('AI-generated');
    expect(figure).toContain(`src="${preview.src}"`);
    expect(figure).toContain(`alt="${preview.alt}"`);
    expect(figure).toContain('loading="lazy"');
    expect(figure).not.toMatch(/<button|<input|<select/);
  }
  for (const style of artStyleCatalog) {
    expect(html).toContain(style.label);
    expect(html).toContain(style.thesis);
  }
  expect(session.getSnapshot()).toBe(before);
  session.dispose();
});

test('art previews support the desktop harness plain-function invocation under the server dispatcher', () => {
  function Probe() {
    return ArtPreviewImage({ src: '/art/preset-heraldic-urn.webp', alt: 'Heraldic sample art: draw urn' });
  }
  const html = renderToStaticMarkup(<Probe />);
  expect(html).toContain('<img');
  expect(html).toContain('src="/art/preset-heraldic-urn.webp"');
  expect(html).toContain('alt="Heraldic sample art: draw urn"');
  expect(html).toContain('loading="lazy"');
});

test('an unavailable preview removes the image and shows a plain fallback', () => {
  const onError = vi.fn();
  function Probe() {
    const image = ArtPreviewImage({ src: '/art/preset-heraldic-urn.webp', alt: 'Heraldic sample art: draw urn' });
    if (image.type === 'img') {
      onError();
      // React re-renders this probe after the image's actual error handler sets state.
      image.props.onError();
    }
    return image;
  }
  const fallback = renderToStaticMarkup(<Probe />);
  expect(onError).toHaveBeenCalledOnce();
  expect(fallback).toContain('role="status"');
  expect(fallback).toContain('not available');
  expect(fallback).not.toContain('<img');
});

test('preview and tear handlers use the same queue; a preview error leaves current visible', () => {
  const { session, id } = setup();
  const view = () => DesignFocusView({ artifact: 'urn', session, snapshot: session.getSnapshot() });
  const actions = () => view().props.children.at(-2).props.children;
  expect(actions()[1].type).toBe(SealButton);
  expect(actions()[1].props.disabled).toBe(true);
  actions()[0].props.onClick();
  expect(actions()[1].props.disabled).toBe(false);
  const html = renderToStaticMarkup(<DesignFocus artifact="urn" session={session} />);
  expect(html).toContain('Simulated urn engraved preview');
  expect(html).toContain('Simulated urn halftone preview');
  session.queue.amend(id, [{ key: 'ink', value: 'invalid' }]);
  actions()[0].props.onClick();
  const failed = renderToStaticMarkup(<DesignFocus artifact="urn" session={session} />);
  expect(failed).toContain('role="alert"');
  expect(failed).toContain('Simulated urn halftone preview');
  expect(actions()[1].props.disabled).toBe(true);
  actions()[2].props.onClick();
  expect(session.queue.pending()).toHaveLength(0);
  expect(session.getSnapshot().previews[id]).toBeUndefined();
  session.dispose();
});

test('Space hold applies the captured preview; amending during a hold fails closed', () => {
  vi.useFakeTimers();
  try {
    for (const stale of [false, true]) {
      const { session, id } = setup(); session.preview(id);
      const view = DesignFocusView({ artifact: 'urn', session, snapshot: session.getSnapshot() });
      const seal = view.props.children.at(-2).props.children[1];
      const before = session.current('urn');
      const hold = createSealHold(seal.props.on_seal, () => undefined);
      const control = SealControl({ hold, progress: 0, variant: 'proclaim' });
      control.props.onKeyDown({ key: ' ', repeat: false, preventDefault: vi.fn(), nativeEvent: { isComposing: false } });
      if (stale) session.queue.amend(id, [{ key: 'density', value: 'bold' }]);
      vi.advanceTimersByTime(sealHoldDurationMs);
      expect(session.current('urn') === before).toBe(stale);
      expect(session.queue.getSnapshot().proposals[0]?.state).toBe(stale ? 'amended' : 'proclaimed');
      hold.cancel(); session.dispose();
    }
  } finally { vi.useRealTimers(); }
});

test.each(presetCatalog)('$id has a data-driven illustrative scene with no executable markup', preset => {
  const html = renderToStaticMarkup(<DesignScene output={preset.output} />);
  expect(html).toContain('role="img"');
  expect(html).toContain('<path');
  expect(html).not.toMatch(/<script|<iframe|href=|src=/);
});

test('design styles use only shared tokens with the readable type floor', () => {
  const css = readFileSync(new URL('./focus.css', import.meta.url), 'utf8');
  const known = new Set([...Object.keys(tokens.layout), ...Object.keys(tokens.theme.paper), 'design-ink']);
  for (const [, token] of css.matchAll(/var\(--([\w-]+)/g)) expect(known.has(token ?? '')).toBe(true);
  expect(css).not.toMatch(/#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(|\b\d+(?:\.\d+)?px\b/i);
  for (const [, token] of css.matchAll(/font(?:-size)?:[^;]*var\(--(text-[\w-]+)/g)) {
    const value = Object.entries(tokens.layout).find(([name]) => name === token)?.[1];
    expect(Number.parseFloat(value ?? '')).toBeGreaterThanOrEqual(13);
  }
});
