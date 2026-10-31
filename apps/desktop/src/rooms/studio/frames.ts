import { studioCopy as copy } from '../../studio-copy.js';
import type { BoardGeometry } from './board.js';

export const viewerFrames = Object.freeze([
  Object.freeze({ id: 'panel', label: copy.frame_panel, width: 318, height: 500, touch: true }),
  Object.freeze({ id: 'mobile', label: copy.frame_mobile, width: 360, height: 640, touch: true }),
  Object.freeze({ id: 'video-overlay', label: copy.frame_video, width: 1280, height: 720, touch: false }),
  Object.freeze({ id: 'obs-1080p', label: copy.frame_obs, width: 1920, height: 1080, touch: false }),
] as const);
export type ViewerFrame = typeof viewerFrames[number];

export function selectViewerFrame(previous: ViewerFrame, id: string): ViewerFrame {
  return viewerFrames.find(frame => frame.id === id) ?? previous;
}

/** fit_width already includes sqrt(3). scale is the hex radius in source pixels.
 * The framed canvas uses the entire fit bounds (no main-table gutter). Labels
 * use a conservative 44-pixel hex-width floor for the two-line id/house stack. */
export function frameReadout(frame: ViewerFrame, extent: Pick<BoardGeometry, 'fit_width' | 'fit_height'>) {
  const scale = Math.min(frame.width / extent.fit_width, frame.height / extent.fit_height);
  const hex_px = Math.floor(scale * Math.sqrt(3));
  return Object.freeze({ hex_px, tap_ok: !frame.touch || hex_px >= 44, labels_legible: hex_px >= 44, scale });
}
