import type { ArtNode, ArtPaint } from './types.ts';

function dots(
  id: string, size: number, radius: number, fill: ArtPaint,
  options: { rotation?: number; opacity?: string } = {},
): ArtNode {
  return {
    tag: 'pattern', id,
    attrs: {
      width: String(size), height: String(size), patternUnits: 'userSpaceOnUse',
      ...(options.rotation === undefined ? {} : { patternTransform: `rotate(${options.rotation})` }),
    },
    children: [{
      tag: 'circle',
      attrs: {
        cx: String(size / 2), cy: String(size / 2), r: String(radius),
        ...(options.opacity === undefined ? {} : { opacity: options.opacity }),
      },
      paint: { fill },
    }],
  };
}

function stop(offset: string, colour: ArtPaint, opacity?: string): ArtNode {
  return {
    tag: 'stop',
    attrs: { offset, ...(opacity === undefined ? {} : { 'stop-opacity': opacity }) },
    paint: { stop: colour },
  };
}

// Paths and pattern geometry extracted from .port/winner/keep-art.js defs().
export function defs(): ArtNode {
  return {
    tag: 'defs', attrs: {}, children: [
      dots('htStone', 6, 1.05, 'art-key', { opacity: '.5' }),
      dots('htStone2', 9, 1.9, 'art-key', { rotation: 30, opacity: '.18' }),
      dots('htOr', 8, 2.3, 'art-or', { rotation: 15 }),
      dots('htOrS', 7, 1.2, 'art-or', { rotation: 15 }),
      dots('htAz', 7, 1.4, 'art-azure', { rotation: -20 }),
      dots('htAzL', 9, 1.1, 'art-azure', { rotation: -20, opacity: '.55' }),
      dots('htShadow', 5, 1.5, 'art-gules', { rotation: 45 }),
      dots('htGu', 6, 1.3, 'art-hatch', { rotation: 45, opacity: '.55' }),
      {
        tag: 'pattern', id: 'courses',
        attrs: { width: '44', height: '22', patternUnits: 'userSpaceOnUse' },
        children: [{
          tag: 'path',
          attrs: {
            d: 'M0 21.5H44M22 0V11M0 11H44M0 11V22M44 11V22',
            'stroke-width': '1', opacity: '.09',
          },
          paint: { stroke: 'art-key', fill: 'none' },
        }],
      },
      {
        tag: 'pattern', id: 'boards',
        attrs: { width: '30', height: '12', patternUnits: 'userSpaceOnUse' },
        children: [{
          tag: 'path', attrs: { d: 'M0 11.5H30M15 0V12', 'stroke-width': '1', opacity: '.18' },
          paint: { stroke: 'art-key' },
        }],
      },
      {
        tag: 'radialGradient', id: 'roomLight', attrs: { cx: '50%', cy: '38%', r: '75%' },
        children: [stop('0', 'art-room-1'), stop('.65', 'art-room-2'), stop('1', 'art-room-3')],
      },
      {
        tag: 'radialGradient', id: 'warm', attrs: { cx: '50%', cy: '50%', r: '50%' },
        children: [stop('0', 'art-or', '.55'), stop('1', 'art-or', '0')],
      },
      {
        tag: 'radialGradient', id: 'sun', attrs: { cx: '50%', cy: '50%', r: '50%' },
        children: [stop('0', 'art-sun-1'), stop('.55', 'art-sun-2', '.55'), stop('1', 'art-sun-2', '0')],
      },
      {
        tag: 'clipPath', id: 'rollClip', attrs: {},
        children: [{ tag: 'rect', attrs: { x: '226', y: '388', width: '112', height: '100' } }],
      },
    ],
  };
}
