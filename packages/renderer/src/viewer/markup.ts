import { integer, record } from '../templates/validation.ts';

/** Renderer-local viewport, independent of transport/design schemas. */
export function outputDimensions(value: unknown = {}): Readonly<{ width: number; height: number }> {
  const fields = record(value, ['width', 'height'], 'output viewport');
  const width = Object.hasOwn(fields, 'width') ? integer(fields.width, 'width', 32) : 318;
  const height = Object.hasOwn(fields, 'height') ? integer(fields.height, 'height', 32) : 318;
  if (width > 16384 || height > 16384) throw new Error('output viewport exceeds 16384');
  return Object.freeze({ width, height });
}

/** All labels/attributes are literal text; data never becomes executable markup. */
export function escapeMarkup(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
