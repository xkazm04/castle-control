import { art, frames, styles } from '../../demo/model.js';
import { library_prefix, presetsFor, presetUrl } from '../../custom-design/presets.js';

type Preset = { id: string; label: string; kind: 'object' | 'frame'; url: string; width: number; height: number };

/** The pickers offer the library's ten beacon and ten frame presets (design ids `library-<id>`, imported by the core on save). */
export const presets: readonly Preset[] = [
  ...presetsFor('beacon').map(item => ({ id: `${library_prefix}${item.id}`, label: `${item.style_name} · beacon`, kind: 'object' as const,
    url: presetUrl(item), width: item.width, height: item.height })),
  ...presetsFor('frame').map(item => ({ id: `${library_prefix}${item.id}`, label: `${item.style_name} · frame`, kind: 'frame' as const,
    url: presetUrl(item), width: item.width, height: item.height })),
];

// Classic sample art: the core embeds these ids (crates/cc-core/src/beacons/presets.rs), so saved visuals keep
// showing them. Display data only; style IDs and labels belong to the existing demo atlas.
const kinds = [
  { asset: 'altar', kind: 'object', width: 640, height: 640 },
  { asset: 'frame', kind: 'frame', width: 640, height: 357 },
] as const;
const heraldic_altar_height = 857;
export const classic_presets: readonly Preset[] = styles.flatMap(style => kinds.map(kind => ({
  id: `preset-${style.id}-${kind.asset}`,
  label: `${style.label} ${kind.asset}`,
  kind: kind.kind,
  url: kind.asset === 'altar' ? art(style.id, 'altar') : frames[style.id],
  width: kind.width,
  height: style.id === 'heraldic' && kind.asset === 'altar' ? heraldic_altar_height : kind.height,
})));

export function findPreset(id: string | undefined) {
  return presets.find(preset => preset.id === id) ?? classic_presets.find(preset => preset.id === id);
}

export function styleChoice(id: string | undefined) {
  return id ? findPreset(id)?.id ?? 'custom' : '';
}
