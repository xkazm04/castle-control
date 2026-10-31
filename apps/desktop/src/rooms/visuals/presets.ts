import { art, frames, styles } from '../../demo/model.js';

// Display data only. Style IDs and labels belong to the existing demo atlas.
// The native parity test evaluates this catalog against the actual WebP headers.
const kinds = [
  { asset: 'altar', kind: 'object', width: 640, height: 640 },
  { asset: 'frame', kind: 'frame', width: 640, height: 357 },
] as const;
const heraldic_altar_height = 857;

export const presets = styles.flatMap(style => kinds.map(kind => ({
  id: `preset-${style.id}-${kind.asset}`,
  label: `${style.label} ${kind.asset}`,
  kind: kind.kind,
  url: kind.asset === 'altar' ? art(style.id, 'altar') : frames[style.id],
  width: kind.width,
  height: style.id === 'heraldic' && kind.asset === 'altar' ? heraldic_altar_height : kind.height,
})));

export function findPreset(id: string | undefined) {
  return presets.find(preset => preset.id === id);
}

export function styleChoice(id: string | undefined) {
  return id ? findPreset(id)?.id ?? 'custom' : '';
}
