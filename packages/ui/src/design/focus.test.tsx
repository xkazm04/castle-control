import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { tokens } from '@castle-control/tokens';
import { expect, test, vi } from 'vitest';
import { ProposalQueue } from '../steward/queue.js';
import { SealButton, SealControl, createSealHold, sealHoldDurationMs } from '../seal-button.jsx';
import { DesignFocus, DesignFocusView } from './focus.jsx';
import { presetCatalog } from './catalog.js';
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
