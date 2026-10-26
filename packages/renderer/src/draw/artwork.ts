import type { DrawArtworkLayer, DrawMotion, DrawPath, DrawShape } from './model.ts';

// Original vector scene descriptions, not adapted from the prototype or Overlord.
// These are logical SVG coordinates, not component CSS pixel values.
const paths: Readonly<Record<DrawShape, readonly DrawPath[]>> = {
  urn: [
    { ink: 'gules', d: 'M112 52H208L196 80C254 108 246 178 192 196H128C74 178 66 108 124 80Z' },
    { ink: 'key', d: 'M104 42H216V54H104ZM124 196H196V210H124Z' },
    { ink: 'or', d: 'M138 98H182V130H138Z' },
    { ink: 'paper', d: 'M146 106H174V110H146ZM146 118H166V122H146Z' },
  ],
  wheel: [
    { ink: 'key', d: 'M160 22A94 94 0 1 1 159.99 22ZM144 202H176V224H144Z' },
    { ink: 'gules', d: 'M160 116L160 30A86 86 0 0 1 246 116ZM160 116L160 202A86 86 0 0 1 74 116Z' },
    { ink: 'or', d: 'M160 116L246 116A86 86 0 0 1 160 202ZM160 116L74 116A86 86 0 0 1 160 30Z' },
    { ink: 'paper', d: 'M160 106A10 10 0 1 1 159.99 106Z' },
    { ink: 'key', d: 'M148 10H172L160 36Z' },
  ],
  deck: [
    { ink: 'key', d: 'M83 52L205 26L243 204L121 230Z' },
    { ink: 'or', d: 'M87 36L211 44L199 224L75 216Z' },
    { ink: 'paper', d: 'M100 24H224V204H100Z' },
    { ink: 'gules', d: 'M110 34H214V194H110ZM148 102L174 86L190 112L164 128Z' },
    { ink: 'key', d: 'M126 152H198V158H126ZM126 168H174V174H126Z' },
  ],
  ballot_box: [
    { ink: 'key', d: 'M64 94L112 66H230L264 94V216H64Z' },
    { ink: 'gules', d: 'M72 102H256V208H72Z' },
    { ink: 'or', d: 'M72 94L114 74H228L254 94Z' },
    { ink: 'key', d: 'M132 84H206V90H132Z' },
    { ink: 'paper', d: 'M138 20L204 32L194 84H128Z' },
    { ink: 'key', d: 'M146 42L158 56L184 36L190 44L156 70L140 50Z' },
  ],
};

export function drawArtwork(shape: DrawShape): DrawArtworkLayer {
  const source = paths[shape];
  if (!source) throw new RangeError('Unsupported draw shape');
  return Object.freeze({
    kind: 'artwork', shape, view_box: '0 0 320 240',
    paths: Object.freeze(source.map((path) => Object.freeze({ ...path }))),
  });
}

const movement: Readonly<Record<DrawShape, Pick<DrawMotion, 'property' | 'from' | 'to'>>> = {
  urn: { property: 'rotate_deg', from: -12, to: 0 },
  wheel: { property: 'rotate_deg', from: -720, to: 0 },
  deck: { property: 'scale_x', from: 0, to: 1 },
  ballot_box: { property: 'translate_y', from: -24, to: 0 },
};

/** A fixed flourish, not a spin whose landing position selects a winner. */
export function drawMotion(shape: DrawShape): DrawMotion {
  return Object.freeze({
    target: 'artwork', ...movement[shape], at_ms: 0, duration_ms: 1200,
    easing: 'cubic-bezier(.2,.8,.2,1)',
  });
}
