import { expect, test } from 'vitest';
import { boardGeometry } from './board.js';
import { boardForSize } from './session.js';
import { frameReadout, selectViewerFrame, viewerFrames } from './frames.js';

test('frame presets are deeply frozen, finite integer canvases and unknown selections preserve identity', () => {
  expect(Object.isFrozen(viewerFrames)).toBe(true);
  expect(viewerFrames.map(frame => frame.id)).toEqual(['panel', 'mobile', 'video-overlay', 'obs-1080p']);
  for (const frame of viewerFrames) {
    expect(Object.isFrozen(frame)).toBe(true);
    for (const dimension of [frame.width, frame.height]) {
      expect(Number.isSafeInteger(dimension)).toBe(true); expect(dimension).toBeGreaterThan(0);
    }
    expect(selectViewerFrame(viewerFrames[0], frame.id)).toBe(frame);
    expect(selectViewerFrame(frame, 'unknown')).toBe(frame);
  }
});

test('default readouts derive from the real conservative fit bounds, with no second sqrt(3) on the extent', () => {
  const extent = boardGeometry(boardForSize('m'));
  expect(extent.fit_width).toBe(16.46); expect(extent.fit_height).toBe(9.52);
  const readouts = viewerFrames.map(frame => frameReadout(frame, extent));
  expect(readouts.map(item => item.hex_px)).toEqual([33, 37, 130, 196]);
  expect(readouts.map(item => item.tap_ok)).toEqual([false, false, true, true]);
  expect(readouts.map(item => item.labels_legible)).toEqual([false, false, true, true]);
  expect(readouts[0]?.scale).toBeCloseTo(318 / 16.46);
  expect(readouts[3]?.scale).toBeCloseTo(1080 / 9.52);
});

test('S/M/L readouts follow the same board and formula as the table', () => {
  for (const size of ['s', 'm', 'l'] as const) {
    const geometry = boardGeometry(boardForSize(size));
    for (const frame of viewerFrames) {
      const readout = frameReadout(frame, geometry);
      expect(readout.hex_px).toBe(Math.floor(Math.min(frame.width / geometry.fit_width,
        frame.height / geometry.fit_height) * Math.sqrt(3)));
    }
  }
});
