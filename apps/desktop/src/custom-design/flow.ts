import { createElement } from 'react';
import type { ArtAssetKind } from '@castle-control/contract';
import { defineFlow } from '@castle-control/ui/steward-flow';
import type { FlowChamber, FlowLine, FlowOption, StewardFlow, WorkContext } from '@castle-control/ui/steward-flow';
import type { Snapshot } from '../model.js';
import { CustomPreview } from './preview.jsx';
import { presetsFor, presetUrl } from './presets.js';
import type { DesignState, Made, MakeInput } from './runtime.js';
import type { CustomHost, SealChoice } from './seal.js';

/**
 * "Custom design": one Steward flow per asset kind, registered in its chamber. Request ->
 * library suggestions -> (make a new one: size -> one question -> Generating...) -> living
 * preview -> hold to seal. Everything heavy (catalog, director, search, core pipeline, the
 * preview) loads on first use; this file only describes the steps.
 */
export type CustomDraft = { request?: string; found?: string; pick?: string; size?: string; answer?: string; made?: string };

type KindCopy = { chamber: FlowChamber; noun: string; title: string; chip: string; intents: readonly string[]; feel: string };
const kinds: Readonly<Record<ArtAssetKind, KindCopy>> = {
  beacon: { chamber: 'visuals', noun: 'beacon', chip: 'Custom beacon', title: 'Custom design · beacon', feel: 'a reactor core, a brazier, a crystal...',
    intents: ['custom beacon', 'design a beacon', 'beacon art', 'custom design', 'new look', 'make art', 'generate art'] },
  frame: { chamber: 'visuals', noun: 'facecam frame', chip: 'Custom frame', title: 'Custom design · facecam frame', feel: 'gothic iron, cozy wood, a neon HUD...',
    intents: ['custom frame', 'facecam frame', 'webcam frame', 'webcam border', 'camera frame', 'design a frame'] },
  vote_bar: { chamber: 'moderator', noun: 'vote bar', chip: 'Custom design', title: 'Custom design · vote bar', feel: 'runes, neon tubes, a boss health bar...',
    intents: ['custom vote bar', 'vote bar art', 'design the vote bar', 'custom design', 'bar art', 'restyle the bar'] },
  draw_vessel: { chamber: 'lottery', noun: 'draw vessel', chip: 'Custom design', title: 'Custom design · draw vessel', feel: 'a loot chest, a capsule machine, an urn...',
    intents: ['custom vessel', 'draw vessel', 'vessel art', 'design the urn', 'custom design', 'loot chest', 'urn art'] },
};

type Runtime = { state: DesignState; module: typeof import('./runtime.js') };
type Chosen = Made | (Omit<Made, 'key' | 'signature'> & { source: 'library' });

export function customFlowId(kind: ArtAssetKind): string { return `custom-design-${kind.replace('_', '-')}`; }

export function customDesignFlow(kind: ArtAssetKind, snapshot: Snapshot, host: CustomHost): StewardFlow<CustomDraft> {
  const copy = kinds[kind];
  const core = snapshot.mode !== 'fixture';
  let runtime: Runtime | undefined;
  let loading: Promise<Runtime> | undefined;
  const load = () => loading ??= (async () => {
    const module = await import('./runtime.js');
    const mode = core ? { core: true as const, beacons: async () => (await import('./seal.js')).beaconsPort(snapshot) } : { core: false as const };
    runtime = { module, state: module.createDesignState(kind, mode, url => fetch(url)) };
    return runtime;
  })().catch((error: unknown) => { loading = undefined; throw error; });
  const input = (draft: CustomDraft): MakeInput | undefined => {
    const size = runtime?.state.size(draft.size);
    return draft.request && size ? { request: draft.request, size, ...(draft.answer ? { answer: draft.answer } : {}) } : undefined;
  };
  function chosen(draft: CustomDraft): Chosen | undefined {
    if (!runtime) return undefined;
    if (draft.pick === 'new') return runtime.state.made(draft.made);
    const asset = runtime.state.asset(draft.pick);
    return asset && { source: 'library', library_id: asset.id, style_name: asset.style_name, art: runtime.module.libraryArt(asset, kind) };
  }
  const source = (made: Chosen) => made.source === 'library' ? 'Library · ready-made, free'
    : made.source === 'simulated' ? 'SIMULATED · closest library art stands in for a new image'
      : `Generated with your OpenAI key${made.cost ? ` · ${made.cost}` : ''}`;
  const destination = core
    ? { beacon: 'A new beacon in your core', frame: 'A new camera frame in your core', vote_bar: 'The vote bar on stream', draw_vessel: 'The selected draw\'s vessel' }[kind]
    : 'This preview session only · SIMULATED';
  function lines(draft: CustomDraft): FlowLine[] {
    const made = chosen(draft);
    if (!made) return [{ label: 'Look', value: 'Not chosen' }];
    const size = runtime?.state.size(draft.size);
    return [{ label: 'Look', value: made.style_name }, { label: 'Source', value: source(made) },
      ...(size && made.source !== 'library' ? [{ label: 'Size', value: `${size.width} × ${size.height}` }] : []),
      ...(made.direction ? [{ label: 'Direction', value: `${made.direction.interpretation}${made.scripted ? ' (scripted)' : ''}` }] : []),
      { label: 'Goes to', value: destination }];
  }
  function newOption(): FlowOption {
    if (!core) return { id: 'new', label: 'Make a new one', simulated: true,
      consequence: 'Fixture mode: the closest library art stands in for a generated image. Nothing is spent.' };
    if (runtime?.state.canGenerate()) return { id: 'new', label: 'Make a new one', consequence: 'Generated for you with your own OpenAI key (a few cents). Library picks stay free.' };
    return { id: 'new', label: 'Make a new one', disabled: true, consequence: 'Add your OpenAI key in Settings to make a new one. Library picks work without it.' };
  }

  return defineFlow<CustomDraft>({
    id: customFlowId(kind), chamber: copy.chamber, title: copy.title, chip: copy.chip, intents: copy.intents, simulated: !core,
    intro: `A custom ${copy.noun}: say how it should feel, and I will show ready-made art that fits first. Only if none does, we make a new one. Nothing reaches your stream until you hold to seal.`,
    initial: () => ({}),
    steps: [
      { id: 'request', kind: 'field', label: 'Feel', prompt: `What should your ${copy.noun} feel like? A few words is plenty: ${copy.feel}`,
        placeholder: 'make it look cool', hint: 'Or pick one of the presets below.',
        suggestions: () => presetsFor(kind).map(item => item.style_name),
        initial: draft => draft.request ?? '',
        validate: raw => raw.trim() && raw.trim().length <= 500 ? null : 'Say a few words, up to 500 characters.',
        apply: (draft, raw) => ({ ...draft, request: raw.trim() }) },
      { id: 'found', kind: 'work', label: 'Library', prompt: 'Looking through the library...',
        run: async (draft, context: WorkContext) => (await load()).state.search(draft.request ?? '', context),
        accepts: (draft, value) => value === draft.request && runtime?.state.matches(value) !== undefined,
        apply: (draft, value) => ({ ...draft, found: value }),
        summary: draft => `${runtime?.state.matches(draft.found)?.length ?? 0} suggestions` },
      { id: 'pick', kind: 'choice', label: 'Pick', prompt: 'These ready-made ones fit best. Pick one, or make a new one.',
        options: draft => [...(runtime?.state.matches(draft.found) ?? []).map((match, index): FlowOption => ({ id: match.asset.id, label: match.asset.style_name,
          picture: { src: presetUrl(match.asset), alt: `${match.asset.style_name} · library art` },
          consequence: 'Ready-made · free · on stream at once', ...(index === 0 ? { tag: 'closest' } : {}) })), newOption()],
        apply: (draft, id) => ({ ...draft, pick: id }) },
      { id: 'size', kind: 'choice', label: 'Size', prompt: 'Which size? Each fits your OBS canvas; the app stretches or 9-slices the rest.',
        when: draft => draft.pick === 'new',
        options: () => (runtime?.state.sizes() ?? []).map(size => ({ id: size.id, label: `${size.label} · ${size.width} × ${size.height}`, consequence: size.line })),
        apply: (draft, id) => ({ ...draft, size: id }) },
      { id: 'question', kind: 'choice', label: 'Answer', prompt: 'One question so it comes out right.',
        when: draft => draft.pick === 'new',
        ask: draft => { const made = input(draft); const question = made && runtime?.state.question(made.request, made.size);
          return question ? `One question so it comes out right: ${question.text} I assumed the tagged one.` : 'One question so it comes out right.'; },
        options: draft => {
          const made = input(draft);
          const question = made && runtime?.state.question(made.request, made.size);
          return (question?.options ?? []).map(option => ({ id: option, label: option, ...(option === question?.assumed ? { tag: 'assumed' } : {}) }));
        },
        apply: (draft, id) => ({ ...draft, answer: id }) },
      { id: 'make', kind: 'work', label: 'Made', prompt: 'Generating...', when: draft => draft.pick === 'new',
        note: () => core ? 'Uses your OpenAI key: charged once per image. Cancel stops waiting; an image already made is kept and reused.'
          : 'SIMULATED · nothing is generated and nothing is spent.',
        run: async (draft, context) => {
          const { state } = await load();
          const made = input(draft);
          if (!made) throw new Error('Choose a size first.');
          return state.make(made, context);
        },
        accepts: (draft, value) => { const made = input(draft); return !!made && runtime?.state.made(value)?.signature === runtime?.state.signature(made); },
        apply: (draft, value) => ({ ...draft, made: value }),
        summary: draft => runtime?.state.made(draft.made)?.style_name ?? 'done' },
      { id: 'look', kind: 'preview', label: 'Preview', continue_label: 'Use this',
        prompt: 'Here it is, alive with sample data.',
        render: draft => { const made = chosen(draft); return made ? createElement(CustomPreview, { art: made.art, note: made.note }) : null; },
        lines: draft => lines(draft).filter(line => line.label !== 'Goes to' && line.label !== 'Look'),
        actions: draft => draft.pick === 'new' ? [{ label: 'Try again', step: 'make' }, { label: 'Adjust', step: 'question' }]
          : [{ label: 'Other suggestions', step: 'pick' }] },
      { id: 'seal', kind: 'confirm', label: 'Seal', prompt: `Hold to seal: the ${copy.noun} goes on stream.`, lines,
        note: core ? 'Saved to your core on your hold. Money changes looks only.' : 'SIMULATED · changes this preview session only. Nothing reaches OBS or chat.' },
    ],
    seal: async draft => {
      const made = chosen(draft);
      if (!made) throw new Error('Nothing chosen to seal.');
      const choice: SealChoice = { kind, style_name: made.style_name, simulated: !core,
        ...(made.library_id ? { library_id: made.library_id } : {}), ...(made.design_id ? { design_id: made.design_id } : {}) };
      return (await import('./seal.js')).sealCustom(snapshot, choice, host);
    },
  });
}

const flows = new WeakMap<Snapshot, Map<ArtAssetKind, StewardFlow<CustomDraft>>>();
/** One flow object per snapshot and kind, so a rebuilt registry resumes the same draft and caches. */
export function customFlow(kind: ArtAssetKind, snapshot: Snapshot, host: () => CustomHost): StewardFlow<CustomDraft> {
  let byKind = flows.get(snapshot);
  if (!byKind) { byKind = new Map(); flows.set(snapshot, byKind); }
  let flow = byKind.get(kind);
  if (!flow) { flow = customDesignFlow(kind, snapshot, host()); byKind.set(kind, flow); }
  return flow;
}
