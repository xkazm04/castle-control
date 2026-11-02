import type { ArtAssetKind, ArtDirection, ArtQuestion } from '@castle-control/contract';
import { namedColours, pickTheme, translate } from './vocabulary.js';

/**
 * The scripted art director: one offline TypeScript implementation that turns a vague
 * request into an ArtDirection, used in fixture mode and whenever the core's engine-backed
 * `beacons.art.direct` is unavailable. Same rules as the proven Codex art-director brief.
 */
export type DirectRequest = { kind: ArtAssetKind; request: string; width: number; height: number; answer?: string };

type KindSpec = { label: string; spec: string; rules: string; background: string; question: ArtQuestion };
export const kind_specs: Readonly<Record<ArtAssetKind, KindSpec>> = {
  draw_vessel: {
    label: 'Draw vessel (giveaway)',
    spec: 'The vessel that visibly holds giveaway entries and casts out winners. One centred object, three-quarter view, the whole object in frame with margin, a visible chamber for entries and a clear mouth or chute where winners leave. Reads at 300px on a 1080p stream.',
    rules: '',
    background: 'Transparent background (real alpha), the object fully isolated with a clean edge.',
    question: { text: 'What kind of vessel?', options: ['Urn or reliquary', 'Treasure chest', 'Capsule machine'], assumed: 'Urn or reliquary' },
  },
  beacon: {
    label: 'Beacon (support reactor)',
    spec: 'An object with an inner glowing core or chamber the app animates: it swells with support and cools down. One centred object, portrait, the full object visible with margin. The glowing core must be clearly separable from the body.',
    rules: '',
    background: 'Transparent background (real alpha), the object fully isolated with a clean edge.',
    question: { text: 'How bright should the core burn?', options: ['Subtle glow', 'Bold flare', 'Wild blaze'], assumed: 'Bold flare' },
  },
  frame: {
    label: 'Facecam frame',
    spec: 'A frame that surrounds the streamer webcam. The whole centre (at least 80% of width and height) stays empty; ornament lives only on the border and corners.',
    rules: 'FULL BLEED: the border runs along all four canvas edges with zero margin outside it. Corners carry the ornament; the sides stay slim so they never cover a face. Bold enough to read as a deliberate, themed frame.',
    background: 'Transparent background AND a fully transparent centre (real alpha) so the webcam shows through; only the border and corner ornaments are opaque.',
    question: { text: 'How heavy should the border be?', options: ['Slim edges', 'Ornate corners', 'Bold full border'], assumed: 'Ornate corners' },
  },
  vote_bar: {
    label: 'Vote bar (chat vote)',
    spec: 'A horizontal chat-vote bar for a lower third: an ornamental housing around an EMPTY track the app fills with 2 to 3 coloured segments, plus small end caps. No icons inside the track.',
    rules: 'The empty track interior must be DARK and tinted with the theme palette (never white or light grey) so bright vote segments read on top. Housing and end caps carry the theme; keep the bar compact in height.',
    background: 'Transparent background (real alpha) around the housing; the empty track interior is opaque and evenly lit so the app can paint segments over it.',
    question: { text: 'What should the housing feel like?', options: ['Sleek and minimal', 'Ornate and heavy', 'Glowing tech'], assumed: 'Ornate and heavy' },
  },
};

const no_text = 'No text, no letters, no numbers, no logos, no watermark.';
const quality = 'Quality: UI or props from a current AAA or top indie game, never cartoon clip-art; rich materials, believable lighting, crisp silhouette, readable small on stream.';
export const prompt_limit = 1400;

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

/** Turn a vague request into a buildable direction. Pure and offline; same input, same output. */
export function directArt(input: DirectRequest): ArtDirection {
  const spec = kind_specs[input.kind];
  const translated = translate(input.request.trim() || 'make it look cool');
  const theme = pickTheme(translated.text);
  const brand = namedColours(translated.text);
  const palette = [...brand, ...theme.palette.filter(colour => !brand.includes(colour))].slice(0, Math.max(4, Math.min(6, brand.length + 2)));
  const answer = input.answer?.trim();
  const question: ArtQuestion = { ...spec.question, assumed: answer && answer.length <= 120 ? answer : spec.question.assumed };
  const style_name = brand.length >= 2 && theme.id === 'house' ? 'Brand Precision' : theme.style_name;
  const aspect = (input.width / input.height).toFixed(2);
  const assumptions = [
    translated.named ? 'The game you named is a mood only: no names, characters or logos in the art.'
      : `"${clip(input.request.trim(), 40)}" reads as ${style_name.toLowerCase()}.`,
    brand.length ? 'Your named colours lead the palette.' : `The palette leans ${theme.lighting.split(' with ')[0]}.`,
    `${question.assumed} suits a ${spec.label.split(' (')[0]!.toLowerCase()} best.`,
  ].slice(0, 3);
  const interpretation = clip(`A ${style_name.toLowerCase()} ${spec.label.split(' (')[0]!.toLowerCase()}: ${theme.id === 'halloween' ? 'candlelit gothic Halloween, jack-o-lantern glow and wrought iron' : theme.materials}; ${theme.lighting}.`, 400);
  const idea = clip(translated.text, 160);
  const sections = [
    `${spec.label}. Streamer's idea, as style: ${idea}. Choice: ${question.assumed}.`,
    `Style: ${style_name}; ${theme.id === 'halloween' ? theme.materials : `materials ${theme.materials}`}; lighting ${theme.lighting}.`,
    `Palette: ${palette.join(', ')}.`,
    `Technical: ${spec.spec}`,
    spec.rules ? `Hard rules: ${spec.rules}` : '',
    `Compose for ${input.width}x${input.height} (aspect ${aspect}:1).`,
    `Background: ${spec.background}`,
    quality,
    no_text,
  ].filter(Boolean);
  let master_prompt = sections.join(' ');
  // Over the cap: shorten the free-form parts first, never the spec, the background or the "no text" clause.
  if (master_prompt.length > prompt_limit) {
    sections[0] = `${spec.label}. Style idea: ${clip(idea, 60)}. Choice: ${question.assumed}.`;
    sections[1] = `Style: ${style_name}; ${clip(theme.materials, 120)}.`;
    master_prompt = clip(sections.join(' '), prompt_limit - no_text.length - 1);
    if (!master_prompt.endsWith(no_text)) master_prompt = `${master_prompt.replace(/…$/, '')} ${no_text}`;
  }
  return { kind: input.kind, interpretation, style_name, palette, assumptions, question, master_prompt,
    width: input.width, height: input.height };
}

/** Per-kind sizes the size step offers. All fit the provider: edges a multiple of 16, ratio within 3:1, at most 1536. */
export type SizeOption = { id: string; label: string; width: number; height: number; line: string };
export const size_options: Readonly<Record<ArtAssetKind, readonly SizeOption[]>> = {
  beacon: [
    { id: 'standard', label: 'Standard portrait', width: 768, height: 1024, line: '3:4 · a beacon beside your game' },
    { id: 'tall', label: 'Tall and detailed', width: 1152, height: 1536, line: '3:4 · crisp at large sizes' },
    { id: 'square', label: 'Square', width: 1024, height: 1024, line: '1:1 · fits a corner' },
  ],
  frame: [
    { id: 'wide', label: '16:9 facecam', width: 1536, height: 864, line: 'The usual webcam shape' },
    { id: 'classic', label: '4:3 facecam', width: 1152, height: 864, line: 'Older and square-ish cams' },
    { id: 'square', label: 'Square cam', width: 1024, height: 1024, line: '1:1 · a round or square crop' },
  ],
  vote_bar: [
    { id: 'lower', label: 'Lower third', width: 1536, height: 512, line: '3:1 · stretched wider without losing the caps' },
    { id: 'compact', label: 'Compact', width: 1152, height: 384, line: '3:1 · a smaller bar' },
    { id: 'chunky', label: 'Chunky', width: 1200, height: 480, line: '2.5:1 · a taller housing' },
  ],
  draw_vessel: [
    { id: 'square', label: 'Square', width: 1024, height: 1024, line: '1:1 · the usual vessel' },
    { id: 'large', label: 'Large square', width: 1536, height: 1536, line: '1:1 · crisp for theatre mode' },
    { id: 'portrait', label: 'Tall', width: 1024, height: 1360, line: '3:4 · a tall urn or machine' },
  ],
};
