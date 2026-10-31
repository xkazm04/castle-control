import { useState, useSyncExternalStore } from 'react';
import type { CSSProperties } from 'react';
import { designSession } from '@castle-control/ui/design';
import type { DesignOutput, DesignSession, DesignSnapshot } from '@castle-control/ui/design';
import { studioCopy as copy } from '../../studio-copy.js';
import { boardGeometry } from './board.js';
import type { StudioBoard } from './board.js';
import { HexTable } from './hex-table.jsx';
import { frameReadout, selectViewerFrame, viewerFrames } from './frames.js';
import type { ViewerFrame } from './frames.js';
import type { MapSize } from './session.js';
import './spyglass.css';

type ViewerProps = { board: StudioBoard; size: MapSize; session?: DesignSession };
type ViewerState = { frame: ViewerFrame; pick: string };
export function Spyglass({ board, size, session = designSession }: ViewerProps) {
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const [state, setState] = useState<ViewerState>({ frame: viewerFrames[0], pick: '' });
  return <SpyglassView board={board} size={size} session={session} snapshot={snapshot} state={state}
    on_frame={id => setState(previous => ({ ...previous, frame: selectViewerFrame(previous.frame, id) }))}
    on_pick={id => setState(previous => boardGeometry(board).tiles.some(tile => tile.id === id)
      ? { ...previous, pick: id } : previous)} />;
}

/** Read-only session projection. Viewer picks live only in the enclosing component. */
export function SpyglassView({ board, size, session, snapshot, state, on_frame, on_pick }: {
  board: StudioBoard; size: MapSize; session: DesignSession; snapshot: DesignSnapshot; state: ViewerState;
  on_frame: (id: string) => void; on_pick: (id: string) => void;
}) {
  const previews = Object.values(snapshot.previews).filter(item => item.artifact === 'map');
  const preview = previews.find(item => item.proposal_id === snapshot.queue.selected_proposal_id) ?? previews.at(-1);
  const pick = boardGeometry(board).tiles.some(tile => tile.id === state.pick) ? state.pick : '';
  return <section className="studio-spyglass" aria-label={copy.spyglass}>
    <div className="studio-frame-picker" role="group" aria-label={copy.frame_picker}>
      {viewerFrames.map(frame => <button type="button" key={frame.id} aria-pressed={state.frame.id === frame.id}
        onClick={() => on_frame(frame.id)}>{frame.label}</button>)}
    </div>
    <p className="studio-spyglass-hint">{copy.frame_hint}</p>
    <div className="studio-viewer-comparison">
      <ViewerFrameView label={copy.look_current} output={snapshot.looks.map.output} board={board} size={size}
        frame={state.frame} pick={pick} on_pick={on_pick} />
      {preview && <ViewerFrameView label={copy.look_draft} output={preview.output} board={board} size={size}
        frame={state.frame} pick={pick} on_pick={on_pick} stale={!session.canSeal(preview)} />}
    </div>
    <p className="studio-viewer-pick" role="status" aria-label={copy.viewer_pick}>{pick ? copy.pick(pick) : copy.pick_hint}</p>
  </section>;
}

export function ViewerFrameView({ label, output, board, size, frame, pick, on_pick, stale = false }: {
  label: string; output: DesignOutput; board: StudioBoard; size: MapSize; frame: ViewerFrame;
  pick: string; on_pick: (id: string) => void; stale?: boolean;
}) {
  const readout = frameReadout(frame, boardGeometry(board));
  const style: CSSProperties & Record<string, number> = { '--frame-width': frame.width, '--frame-height': frame.height };
  return <figure className="studio-viewer" aria-label={`${label} · ${frame.label}`} data-viewer-frame={frame.id}>
    <figcaption><h3>{label}{stale && <strong> · {copy.stale}</strong>}</h3>
      <p>{copy.simulated_viewer}</p><p>{copy.frame_dimensions(frame.width, frame.height)}</p></figcaption>
    <div className="studio-viewer-frame" style={style}><div className="studio-viewer-canvas">
      <HexTable board={board} size={size} selected={pick} on_select={on_pick} look={output.style} />
    </div></div>
    <p className="studio-frame-readout">{copy.hex_size(readout.hex_px)} · {frame.touch
      ? readout.tap_ok ? copy.tap_ok : copy.tap_small : copy.tap_na} · {readout.labels_legible ? copy.labels_ok : copy.labels_small}</p>
  </figure>;
}
