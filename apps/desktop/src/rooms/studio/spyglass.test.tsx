import { readFileSync } from 'node:fs';
import { Children, isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { DesignSession, presetsFor } from '@castle-control/ui/design';
import { ProposalQueue } from '@castle-control/ui/steward';
import { Spyglass, SpyglassView, ViewerFrameView } from './spyglass.jsx';
import { HexTable, TileInspector } from './hex-table.jsx';
import { StudioWork } from './room.jsx';
import { boardForSize } from './session.js';
import { selectViewerFrame, viewerFrames } from './frames.js';
import type { ViewerFrame } from './frames.js';

function setup() {
  const queue = new ProposalQueue();
  const session = new DesignSession(queue, request => ({ ...presetsFor(request.artifact)[0]?.output,
    style: { ink: 'azure', treatment: 'engraved', density: 'quiet' } }));
  return { queue, session };
}
function previewMap(session: DesignSession) {
  const draft = session.draft({ action: 'restyle', artifact: 'map', preset_id: 'hex-map' });
  if (!draft.ok) throw new Error(draft.reason);
  const preview = session.preview(draft.proposal.id);
  if (!preview.ok) throw new Error(preview.reason);
  return preview.preview;
}

test('fresh Spyglass shows one honest viewer frame with native tiles and tap/label readouts, without a submission or fetch', () => {
  const { session } = setup();
  const fetch = vi.spyOn(globalThis, 'fetch');
  try {
    const html = renderToStaticMarkup(<Spyglass session={session} board={boardForSize('m')} size="m" />);
    expect(html.match(/data-viewer-frame=/g)).toHaveLength(1);
    expect(html.match(/data-hex-tile=/g)).toHaveLength(54);
    expect(html).toContain('SIMULATED VIEWER PREVIEW');
    expect(html).toContain('no Extension is built');
    expect(html).toContain('33 px hexes');
    expect(html).toContain('below the 44 px tap target');
    expect(html).toContain('Labels may overlap');
    expect(html).not.toContain('Submit'); expect(fetch).not.toHaveBeenCalled();
  } finally { fetch.mockRestore(); session.dispose(); }
});

type TreeProps = { children?: ReactNode; onClick?: () => void; 'data-hex-tile'?: string; 'aria-pressed'?: boolean; type?: string };
function buttons(tree: ReactNode): ReactElement<TreeProps>[] {
  const found: ReactElement<TreeProps>[] = [];
  Children.forEach(tree, child => {
    if (!isValidElement<TreeProps>(child)) return;
    if (isValidElement<Parameters<typeof ViewerFrameView>[0]>(child) && child.type === ViewerFrameView) {
      found.push(...buttons(ViewerFrameView(child.props)));
    } else if (isValidElement<Parameters<typeof HexTable>[0]>(child) && child.type === HexTable) {
      found.push(...buttons(HexTable(child.props)));
    } else if (child.type === 'button') found.push(child);
    else found.push(...buttons(child.props.children));
  });
  return found;
}

test('native picker and viewer-tile activation change only the viewer, never the streamer inspector, queue or board', () => {
  const { queue, session } = setup();
  previewMap(session);
  const board = boardForSize('m');
  const before_board = JSON.stringify(board);
  const before_queue = queue.getSnapshot();
  const inspector = renderToStaticMarkup(<TileInspector selected="D4" board={board} />);
  const fetch = vi.spyOn(globalThis, 'fetch');
  let frame: ViewerFrame = viewerFrames[0]; let pick = '';
  const view = () => SpyglassView({ board, size: 'm', session, snapshot: session.getSnapshot(), state: { frame, pick },
    on_frame: id => { frame = selectViewerFrame(frame, id); }, on_pick: id => { pick = id; } });
  try {
    const controls = buttons(view());
    expect(controls.slice(0, 4).every(button => button.props.type === 'button')).toBe(true);
    controls[3]?.props.onClick?.();
    expect(frame.id).toBe('obs-1080p');
    const tile = buttons(view()).find(button => button.props['data-hex-tile'] === 'C3');
    expect(tile?.props.type).toBe('button');
    tile?.props.onClick?.();
    const html = renderToStaticMarkup(view());
    expect(html).toContain('Your pick: C3 · simulated viewer');
    expect(html).toContain('196 px hexes');
    expect(queue.getSnapshot()).toBe(before_queue); expect(queue.pending('studio')).toHaveLength(1);
    expect(JSON.stringify(board)).toBe(before_board);
    expect(renderToStaticMarkup(<TileInspector selected="D4" board={board} />)).toBe(inspector);
    expect(fetch).not.toHaveBeenCalled();
  } finally { fetch.mockRestore(); session.dispose(); }
});

test('map previews compare Current and Draft, expose staleness, and sealing reaches the main table', () => {
  const { queue, session } = setup();
  try {
    previewMap(session);
    const render = () => renderToStaticMarkup(<Spyglass session={session} board={boardForSize('m')} size="m" />);
    const html = render();
    expect(html.match(/data-viewer-frame=/g)).toHaveLength(2);
    expect(html).toContain('Current'); expect(html).toContain('Draft · NOT ON AIR');
    expect(html).toContain('data-look-ink="key"'); expect(html).toContain('data-look-ink="azure"');
    expect(html).not.toContain('STALE');
    const proposal = queue.pending('studio')[0];
    if (!proposal) throw new Error('Expected map proposal');
    expect(queue.amend(proposal.id, [{ key: 'prompt', value: 'A changed map draft' }]).ok).toBe(true);
    expect(render()).toContain('STALE');
    const refreshed = session.preview(proposal.id);
    if (!refreshed.ok) throw new Error(refreshed.reason);
    expect(session.seal(refreshed.preview).ok).toBe(true);
    expect(render().match(/data-viewer-frame=/g)).toHaveLength(1);
    const table = renderToStaticMarkup(<StudioWork queue={queue} design_session={session} />);
    expect(table).toContain('data-look-ink="azure"');
    expect(table).toContain('data-treatment="engraved"'); expect(table).toContain('data-density="quiet"');
  } finally { session.dispose(); }
});

test('tear-up leaves the current map look intact and previews of another artifact never add a map frame', () => {
  const { session } = setup();
  try {
    const before = session.current('map');
    const preview = previewMap(session);
    expect(session.tearUp(preview.proposal_id).ok).toBe(true);
    expect(session.current('map')).toBe(before);
    const draft = session.draft({ action: 'restyle', artifact: 'beacon', preset_id: 'offering-altar' });
    if (!draft.ok) throw new Error(draft.reason);
    session.preview(draft.proposal.id);
    const html = renderToStaticMarkup(<Spyglass session={session} board={boardForSize('m')} size="m" />);
    expect(html.match(/data-viewer-frame=/g)).toHaveLength(1);
  } finally { session.dispose(); }
});

test('the Spyglass consumes the room board at each size and look attributes never replace side inks', () => {
  const { session } = setup();
  try {
    for (const [size, count] of [['s', 24], ['m', 54], ['l', 96]] as const) {
      const html = renderToStaticMarkup(<Spyglass session={session} board={boardForSize(size)} size={size} />);
      expect(html.match(/data-hex-tile=/g)).toHaveLength(count);
      expect(html).toContain(`data-map-size="${size}"`);
    }
    const html = renderToStaticMarkup(<HexTable selected="A1" on_select={vi.fn()}
      look={{ ink: 'azure', treatment: 'engraved', density: 'quiet' }} />);
    expect(html).toMatch(/class="cc-herald-field"[^>]*data-look-ink="azure"[^>]*data-treatment="engraved"[^>]*data-density="quiet"/);
    expect(html).toMatch(/data-hex-tile="A1"[^>]*data-ink="gules"/);
    for (const file of ['spyglass.css', 'hex-field.css']) {
      const css = readFileSync(new URL(file, import.meta.url), 'utf8');
      expect(css).not.toMatch(/#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(|\b\d+(?:\.\d+)?px\b/i);
    }
  } finally { session.dispose(); }
});
