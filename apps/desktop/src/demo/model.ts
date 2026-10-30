export type DemoStyle = 'heraldic' | 'pixel' | 'synthwave' | 'watercolor' | 'anime' | 'glass';
export type DemoLayout = 'game' | 'chat';
export type DemoShot = 'malakor-facecam' | 'malakor-lair-wide' | 'malakor-laugh';
export type DemoState = { style: DemoStyle; layout: DemoLayout; shot: DemoShot };

export const styles: readonly { id: DemoStyle; label: string }[] = [
  { id: 'heraldic', label: 'Heraldic' }, { id: 'pixel', label: 'Arcade' },
  { id: 'synthwave', label: 'Neon' }, { id: 'watercolor', label: 'Storybook' },
  { id: 'anime', label: 'Cel' }, { id: 'glass', label: 'Glass' },
];
export const layouts: readonly { id: DemoLayout; label: string }[] = [
  { id: 'game', label: 'Game + cam' }, { id: 'chat', label: 'Just chatting' },
];
export const shots: readonly { id: DemoShot; label: string }[] = [
  { id: 'malakor-facecam', label: 'Facecam' }, { id: 'malakor-lair-wide', label: 'Lair' },
  { id: 'malakor-laugh', label: 'Laugh' },
];

// Round-two frames are provisional; the owner's final pick changes only this map.
export const frames: Record<DemoStyle, string> = {
  heraldic: '/art/preset-heraldic-frame2.webp',
  pixel: '/art/preset-pixel-frame2.webp',
  synthwave: '/art/preset-synthwave-frame2.webp',
  watercolor: '/art/preset-watercolor-frame2.webp',
  anime: '/art/preset-anime-frame2.webp',
  glass: '/art/preset-glass-frame2.webp',
};
export const initialDemoState: DemoState = { style: 'heraldic', layout: 'game', shot: 'malakor-facecam' };
export function art(style: DemoStyle, asset: 'urn' | 'altar' | 'votebar' | 'hexmap'): string {
  return `/art/preset-${style}-${asset}.webp`;
}
export function background(state: DemoState): string {
  return `/art/${state.layout === 'game' ? 'scene-warmap'
    : state.shot === 'malakor-facecam' ? 'malakor-lair-wide' : state.shot}.webp`;
}
