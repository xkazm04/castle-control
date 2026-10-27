import { readFileSync, readdirSync } from 'node:fs';
import type { KeyboardEvent } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { tokens } from '@castle-control/tokens';
import { createSealHold, SealControl, sealHoldDurationMs } from '@castle-control/ui';
import { DesignFocus, DesignSession, designSession, presetsFor } from '@castle-control/ui/design';
import { proposalQueue, ProposalQueue } from '@castle-control/ui/steward';
import { ArtifactActions, DesignArtwork, DesignInspector, designSelection } from './design.jsx';
import type { DesignSelection } from './design.jsx';
import { programCandidate, proclaimToSampleProgram, sampleProgram } from './program.js';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function setup() {
  const queue = new ProposalQueue();
  const session = new DesignSession(queue);
  return { queue, session };
}

function draft(session: DesignSession) {
  const result = session.draft({ action: 'custom', artifact: 'beacon', prompt: 'quiet engraved' });
  if (!result.ok) throw new Error(result.reason);
  return result.proposal.id;
}

const picture = (session: DesignSession, mode: 'preview' | 'program') => renderToStaticMarkup(
  <DesignArtwork artifact="beacon" mode={mode} session={session}><span>Original beacon</span></DesignArtwork>);

test.each(['lottery', 'moderator', 'visuals', 'studio'] as const)('%s Inspector exposes presets and both native keyboard actions', selected => {
  const { session } = setup();
  try {
    const html = renderToStaticMarkup(<DesignInspector selected={selected} session={session} />);
    expect(html).toContain('SIMULATED');
    expect(html).toContain('Preset:');
    expect(html).toContain('>Restyle</button>');
    expect(html).toContain('>Custom design</button>');
    expect(html).not.toContain('tabindex="-1"');
    expect(html).not.toContain('\u2014');
    if (selected === 'visuals') {
      expect(html).toContain('Beacon visuals'); expect(html).toContain('Overlay');
    }
    for (const artifact of ['draw', 'beacon', 'map', 'overlay'] as const) {
      let focus: DesignSelection | undefined;
      const actions = ArtifactActions({ artifact, output: session.current(artifact).output, on_open: value => { focus = value; } })
        .props.children[2].props.children;
      for (const [index, action] of ['restyle', 'custom'].entries()) {
        const button = actions[index];
        expect(button.type).toBe('button'); expect(button.props.type).toBe('button');
        expect(button.props.disabled).not.toBe(true); expect(button.props.tabIndex).not.toBe(-1);
        // Native buttons dispatch click on Enter and Space; no second keymap.
        button.props.onClick();
        expect(focus).toEqual({ artifact, action });
      }
    }
    expect(session.queue.pending()).toHaveLength(0);
  } finally { session.dispose(); }
});

test('reopening a design focus reuses the existing queue proposal without duplication', () => {
  const { queue, session } = setup();
  try {
    const id = draft(session);
    const selection = designSelection(session, { artifact: 'beacon', action: 'restyle' });
    expect(selection.proposal_id).toBe(id);
    const html = renderToStaticMarkup(<DesignFocus artifact={selection.artifact} session={session}
      {...(selection.proposal_id ? { proposal_id: selection.proposal_id } : {})} />);
    expect(html).toContain('cc-design-comparison'); expect(html).toContain('SIMULATED');
    expect(html).toContain('Preview draft'); expect(html).toContain('Current look'); expect(html).toContain('Draft look');
    expect(queue.pending()).toHaveLength(1);
    expect(session.amend(id, { action: 'custom', artifact: 'beacon', prompt: 'bold plain' }).ok).toBe(true);
    expect(queue.pending()).toHaveLength(1); expect(queue.pending()[0]?.revision).toBe(2);
  } finally { session.dispose(); }
});

test('the selected preview is the look shown beside Program, even when another draft was previewed later', () => {
  const { queue, session } = setup();
  try {
    const first = draft(session);
    session.preview(first);
    const other = session.draft({ action: 'restyle', artifact: 'beacon', preset_id: 'hype-border' });
    if (!other.ok) throw new Error(other.reason);
    session.preview(other.proposal.id);
    queue.select(first);
    expect(picture(session, 'preview')).toContain('altar · engraved · quiet');
  } finally { session.dispose(); }
});

test.each(['fresh', 'amended', 'changed look', 'torn'] as const)('preview and a real keyboard hold apply only the captured %s look', cause => {
  const { queue, session } = setup();
  vi.useFakeTimers();
  try {
    const id = draft(session);
    const before = session.current('beacon');
    expect(picture(session, 'program')).toContain('Original beacon');
    const result = session.preview(id);
    if (!result.ok) throw new Error(result.reason);
    expect(picture(session, 'preview')).toContain('DRAFT · NOT ON AIR');
    expect(picture(session, 'preview')).toContain('altar · engraved · quiet');
    expect(picture(session, 'program')).toContain('Original beacon');
    const hold = createSealHold(() => session.seal(result.preview), () => undefined);
    const control = SealControl({ hold, progress: 0, variant: 'proclaim' });
    const space = Object.assign({} as KeyboardEvent<HTMLButtonElement>, {
      key: ' ', repeat: false, preventDefault: vi.fn(), nativeEvent: { isComposing: false },
    });
    control.props.onKeyDown(space); vi.advanceTimersByTime(sealHoldDurationMs / 2); control.props.onKeyUp(space);
    expect(session.current('beacon')).toBe(before);
    control.props.onKeyDown(space);
    if (cause === 'amended') queue.amend(id, [{ key: 'density', value: 'bold' }]);
    if (cause === 'torn') session.tearUp(id);
    if (cause === 'changed look') {
      const other = session.draft({ action: 'restyle', artifact: 'beacon', preset_id: 'hype-border' });
      if (!other.ok) throw new Error(other.reason);
      const preview = session.preview(other.proposal.id);
      if (!preview.ok) throw new Error(preview.reason);
      session.seal(preview.preview);
    }
    const atHold = session.current('beacon');
    vi.advanceTimersByTime(sealHoldDurationMs); hold.cancel();
    if (cause === 'fresh') {
      expect(session.current('beacon').output).toBe(result.preview.output);
      expect(picture(session, 'program')).toContain('altar · engraved · quiet');
      expect(picture(session, 'program')).not.toContain('DRAFT');
      expect(queue.pending()).toHaveLength(0);
    } else {
      expect(session.current('beacon')).toBe(atHold);
      expect(session.canSeal(result.preview)).toBe(false);
      if (cause !== 'torn') {
        const html = renderToStaticMarkup(<DesignFocus artifact="beacon" session={session} proposal_id={id} />);
        expect(html).toContain('Stale draft');
        expect(html).toMatch(/disabled="" aria-label="Hold to seal and proclaim"/);
        expect(session.preview(id).ok).toBe(true);
      } else {
        expect(session.getSnapshot().previews[id]).toBeUndefined();
        expect(picture(session, 'preview')).toContain('Original beacon');
      }
    }
    expect(new Set(queue.getSnapshot().proposals.map(item => item.id)).size).toBe(queue.getSnapshot().proposals.length);
  } finally { session.dispose(); }
});

test('ordinary Overview and queue authorization cannot project or apply a design look', async () => {
  for (const item of proposalQueue.pending()) proposalQueue.tearUp(item.id);
  const before = designSession.current('beacon');
  const program = sampleProgram.getSnapshot();
  const id = draft(designSession);
  try {
    designSession.preview(id);
    expect(programCandidate('visuals')).toBeUndefined();
    expect(await proclaimToSampleProgram(id)).toContain('Open the design focus');
    expect(proposalQueue.pending().filter(item => item.id === id)).toHaveLength(1);
    proposalQueue.proclaim(id);
    expect(designSession.current('beacon')).toBe(before);
    expect(sampleProgram.getSnapshot()).toBe(program);
    expect(picture(designSession, 'program')).toContain('Original beacon');
  } finally { proposalQueue.select(); }
});

test('custom fixtures and every preset leave fetch and WebSocket tripwires untouched', () => {
  const fetch = vi.fn(() => { throw new Error('Network forbidden'); });
  const socket = vi.fn(function () { throw new Error('Socket forbidden'); });
  vi.stubGlobal('fetch', fetch); vi.stubGlobal('WebSocket', socket);
  const { session } = setup();
  try {
    for (const artifact of ['draw', 'beacon', 'overlay', 'map'] as const) {
      for (const preset of presetsFor(artifact)) {
        const result = session.draft({ action: 'restyle', artifact, preset_id: preset.id });
        if (!result.ok) throw new Error(result.reason);
        const preview = session.preview(result.proposal.id);
        if (!preview.ok) throw new Error(preview.reason);
        session.seal(preview.preview);
      }
      const html = renderToStaticMarkup(<DesignFocus artifact={artifact} session={session} />);
      expect(html).not.toMatch(/<iframe|<script|https?:/);
      expect(html).toContain('SIMULATED');
    }
    const id = draft(session); session.preview(id); session.tearUp(id);
    expect(fetch).not.toHaveBeenCalled(); expect(socket).not.toHaveBeenCalled();
  } finally { session.dispose(); }
});

test('mount is lazy, styles stay token-only, and product sources have no code evaluation or network doors', () => {
  const root = new URL('.', import.meta.url);
  const files = readdirSync(root).filter(name => /\.(tsx?|css)$/.test(name) && !name.includes('.test.'));
  console.log(`[overview data-only scan] walked ${files.length} files`);
  expect(files.length).toBeGreaterThan(0);
  for (const name of files) {
    const source = readFileSync(new URL(name, root), 'utf8');
    expect(source).not.toMatch(/\beval\s*\(|\bnew\s+(Function|WebSocket|Worker)\s*\(|\bfetch\s*\(|<iframe|dangerouslySetInnerHTML/);
  }
  const inspector = readFileSync(new URL('inspector.tsx', root), 'utf8');
  expect(inspector).toContain("lazy(() => import('./design.jsx')");
  const css = readFileSync(new URL('design.css', root), 'utf8');
  const known = new Set([...Object.keys(tokens.layout), ...Object.keys(tokens.theme.paper)]);
  for (const [, token] of css.matchAll(/var\(--([\w-]+)/g)) expect(known.has(token ?? '')).toBe(true);
  expect(css).not.toMatch(/#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(|\b\d+(?:\.\d+)?px\b/i);
});
