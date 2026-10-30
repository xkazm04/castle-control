import { expect, test } from 'vitest';
import { ProposalQueue } from '../steward/queue.js';
import { DesignSession } from './session.js';
import { artStyleCatalog, artPreviewsFor, presetCatalog, presetsFor } from './catalog.js';

test('art catalog contains exactly the six kept styles with the owner\'s copy', () => {
  expect(artStyleCatalog).toEqual([
    { id: 'heraldic', label: 'Heraldic', thesis: 'Carved bronze and ember: the house look of Castle Control.' },
    { id: 'pixel', label: 'Arcade', thesis: '16-bit sprites for retro and speedrun channels.' },
    { id: 'synthwave', label: 'Neon', thesis: 'Glowing tubes and chrome for late-night and music streams.' },
    { id: 'watercolor', label: 'Storybook', thesis: 'Soft painted washes for cozy and creative channels.' },
    { id: 'anime', label: 'Cel', thesis: 'Bold outlines and flat colour for anime and VTuber channels.' },
    { id: 'glass', label: 'Glass', thesis: 'Frosted panels and thin light for clean, modern setups.' },
  ]);
  expect(artStyleCatalog.map(style => style.id)).not.toEqual(expect.arrayContaining(['clay', 'comic']));
});

test.each([
  ['draw', 'urn'], ['urn', 'urn'], ['beacon', 'altar'], ['map', 'hexmap'], ['overlay', 'votebar'],
] as const)('%s previews use the six expected %s URLs', (artifact, asset) => {
  expect(artPreviewsFor(artifact).map(preview => preview.src)).toEqual(
    ['heraldic', 'pixel', 'synthwave', 'watercolor', 'anime', 'glass']
      .map(style => `/art/preset-${style}-${asset}.webp`),
  );
});

function setup() {
  const queue = new ProposalQueue();
  const session = new DesignSession(queue);
  const result = session.draft({ action: 'restyle', artifact: 'beacon', preset_id: 'hype-border' });
  if (!result.ok) throw new Error(result.reason);
  return { queue, session, id: result.proposal.id };
}

test('catalog covers draw shapes, beacon visuals, templates and overlays as data', () => {
  expect(presetCatalog.map(preset => preset.id)).toEqual(expect.arrayContaining([
    'urn', 'wheel', 'deck', 'ballot-box', 'overlord-urn', 'offering-altar',
    'gilded-camera-frame', 'hype-border', 'hex-map', 'choice-board', 'viewer-card',
    'draw', 'contribution-meter', 'chat-overlay', 'stream-frame',
  ]));
  expect(presetsFor('draw').map(preset => preset.id)).toContain('wheel');
  expect(presetsFor('urn').map(preset => preset.id)).toContain('overlord-urn');
});

test.each(['restyle', 'custom'] as const)('%s generates data only and preview has no application authority', action => {
  const { session, queue } = setup();
  const before = session.getSnapshot().looks;
  const result = session.draft(action === 'restyle'
    ? { action, artifact: 'urn', preset_id: 'overlord-urn' }
    : { action, artifact: 'urn', prompt: 'a quiet engraved look' });
  if (!result.ok) throw new Error(result.reason);
  const preview = session.preview(result.proposal.id);
  expect(preview.ok).toBe(true);
  expect(session.getSnapshot().looks).toBe(before);
  expect(queue.pending()).toHaveLength(2);
  if (preview.ok) {
    expect(preview.preview.output).toMatchObject({ simulated: true, scene: { shape: 'urn' } });
    expect(preview.preview.output).not.toHaveProperty('html');
  }
});

test.each([
  ['malformed output', () => ({ scene: { shape: 'urn' }, style: { ink: 'remote' }, simulated: true })],
  ['code output', () => ({ html: '<script>run()</script>' })],
  ['failure', () => { throw new Error('Fixture generation failed'); }],
] as const)('%s shows an error and preserves the current look', (_name, generate) => {
  const session = new DesignSession(new ProposalQueue(), generate);
  const before = session.getSnapshot().looks;
  expect(session.draft({ action: 'custom', artifact: 'urn', prompt: 'engraved' }).ok).toBe(false);
  expect(session.getSnapshot().error).toBeTruthy();
  expect(session.getSnapshot().looks).toBe(before);
});

test.each(['amendment', 'current look'] as const)('a stale %s must be previewed again', cause => {
  const { session, queue, id } = setup();
  const first = session.preview(id);
  if (!first.ok) throw new Error(first.reason);
  if (cause === 'amendment') queue.amend(id, [{ key: 'treatment', value: 'engraved' }]);
  else {
    const other = session.draft({ action: 'restyle', artifact: 'beacon', preset_id: 'gilded-camera-frame' });
    if (!other.ok) throw new Error(other.reason);
    const preview = session.preview(other.proposal.id);
    if (!preview.ok) throw new Error(preview.reason);
    expect(session.seal(preview.preview).ok).toBe(true);
  }
  const before = session.getSnapshot().looks;
  expect(session.seal(first.preview).ok).toBe(false);
  expect(session.getSnapshot().looks).toBe(before);
  expect(queue.pending().some(proposal => proposal.id === id)).toBe(true);
  const fresh = session.preview(id);
  if (!fresh.ok) throw new Error(fresh.reason);
  expect(session.seal(fresh.preview).ok).toBe(true);
});

test('seal applies exactly the immutable preview and uses the shared proclaim lifecycle', () => {
  const { session, queue, id } = setup();
  const preview = session.preview(id);
  if (!preview.ok) throw new Error(preview.reason);
  expect(Object.isFrozen(preview.preview.output.style)).toBe(true);
  expect(session.seal({ ...preview.preview }).ok).toBe(false);
  expect(session.seal(preview.preview).ok).toBe(true);
  expect(session.current('beacon').output).toBe(preview.preview.output);
  expect(queue.getSnapshot().proposals.find(proposal => proposal.id === id)?.state).toBe('proclaimed');
  expect(session.seal(preview.preview).ok).toBe(false);
});

test.each(['session', 'shared queue'] as const)('tear through %s discards without applying', path => {
  const { session, queue, id } = setup();
  const before = session.getSnapshot().looks;
  const preview = session.preview(id);
  if (!preview.ok) throw new Error(preview.reason);
  if (path === 'session') session.tearUp(id);
  else queue.tearUp(id);
  expect(session.seal(preview.preview).ok).toBe(false);
  expect(session.getSnapshot().looks).toBe(before);
  expect(queue.pending()).toHaveLength(0);
});

test('a malformed amended field fails the same boundary before preview', () => {
  const { session, queue, id } = setup();
  queue.amend(id, [{ key: 'ink', value: 'url(remote)' }]);
  expect(session.preview(id).ok).toBe(false);
  expect(session.getSnapshot().error).toMatch(/invalid/i);
});

test('session amendments keep one queue proposal and invalidate the old preview', () => {
  const { session, queue, id } = setup();
  const preview = session.preview(id);
  if (!preview.ok) throw new Error(preview.reason);
  expect(session.amend(id, { action: 'restyle', artifact: 'beacon', preset_id: 'gilded-camera-frame' }).ok).toBe(true);
  expect(queue.pending()).toHaveLength(1);
  expect(queue.pending()[0]).toMatchObject({ id, revision: 2, state: 'amended' });
  expect(session.canSeal(preview.preview)).toBe(false);
  expect(session.amend(id, { action: 'restyle', artifact: 'overlay', preset_id: 'stream-frame' }).ok).toBe(false);
});

test('plain queue proclamation cannot apply a simulated design, and listeners share one source', () => {
  const { session, queue, id } = setup();
  const before = session.current('beacon');
  let notifications = 0;
  const unsubscribe = session.subscribe(() => { notifications++; });
  queue.proclaim(id);
  expect(session.current('beacon')).toBe(before);
  expect(session.getSnapshot().queue).toBe(queue.getSnapshot());
  expect(notifications).toBe(1);
  unsubscribe(); session.dispose();
  queue.select(id);
  expect(notifications).toBe(1);
});
