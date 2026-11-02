import { defineFlow } from '@castle-control/ui/steward-flow';
import type { ChamberSteward, FlowOption } from '@castle-control/ui/steward-flow';
import type { Snapshot } from '../model.js';
import { streamPresets } from './presets.js';
import type { StreamPreset } from './presets.js';
import type { StreamRow, StreamSetupModel, StreamState } from './setup-model.js';

/**
 * Stream setup (#/stream) as Steward flows. The page owns the setup model and attaches it
 * here while it is mounted; a flow reads the outputs to offer and calls the model only
 * from its seal. Fixture mode is honest: the model itself adds nothing and says so.
 */
let attached: StreamSetupModel | undefined;
export function attachStreamSetup(model: StreamSetupModel): () => void {
  attached = model;
  return () => { if (attached === model) attached = undefined; };
}
const state = (): StreamState | undefined => attached?.getSnapshot();
const addable = (rows: readonly StreamRow[] = []) => rows.filter(row => (row.visual_id || row.vote_bar || row.duel) && row.phase !== 'added');
const settle = async (model: StreamSetupModel) => {
  for (let tries = 0; tries < 200 && model.getSnapshot().busy; tries++) await new Promise(resolve => setTimeout(resolve, 25));
  return model.getSnapshot();
};
const presetLine: Record<StreamPreset, string> = {
  '1080p': 'Landscape, the usual stream canvas.', '720p': 'Landscape, a lighter canvas.', vertical: 'Portrait, for a vertical stream.',
};
const sizeOptions = (): FlowOption[] => (Object.keys(streamPresets) as StreamPreset[]).map(preset => ({ id: preset,
  label: `${preset} · ${streamPresets[preset].width} × ${streamPresets[preset].height}`, consequence: presetLine[preset] }));
const kindLine = (row: StreamRow) => row.vote_bar ? 'Aggregate-only vote bar. No names, no messages.'
  : row.duel ? 'The Tiltyard duel stage.' : 'A Beacons visual, transparent over your scene.';

export type AddSourceDraft = { output?: string; scene?: string; preset?: StreamPreset; all?: boolean };
const outputName = (draft: AddSourceDraft) => draft.all ? 'Every output ready to add'
  : state()?.rows.find(row => row.id === draft.output)?.name ?? 'Not chosen';
const sceneSteps = [
  { id: 'scene', kind: 'preset', label: 'Scene', prompt: 'Into which OBS scene? It must already exist in OBS.',
    presets: () => [
      { id: 'keep', label: `Scene "${state()?.scene_name ?? 'Scene'}"`, consequence: 'The scene named on the page.' },
      { id: 'other', label: 'Another scene', consequence: 'You type its exact name next.' },
    ],
    apply: (draft: AddSourceDraft, id: string) => id === 'keep' ? { ...draft, scene: state()?.scene_name ?? 'Scene' } : { ...draft, scene: '' },
    summary: (draft: AddSourceDraft, id: string) => id === 'keep' ? draft.scene ?? 'Scene' : 'another' },
  { id: 'scene_name', kind: 'field', label: 'Scene name', prompt: 'Type the scene name exactly as OBS shows it.',
    when: (draft: AddSourceDraft) => draft.scene === '', placeholder: 'Scene',
    validate: (raw: string) => raw.trim().length > 0 && raw.trim().length <= 256 ? null : 'From 1 to 256 characters.',
    apply: (draft: AddSourceDraft, raw: string) => ({ ...draft, scene: raw.trim() }) },
  { id: 'preset', kind: 'choice', label: 'Size', prompt: 'What size should the source be?',
    options: sizeOptions, summary: (_draft: AddSourceDraft, id: string) => id,
    apply: (draft: AddSourceDraft, id: string) => Object.hasOwn(streamPresets, id) ? { ...draft, preset: id as StreamPreset } : draft },
] as const;
const confirmLines = (draft: AddSourceDraft) => [
  { label: 'Output', value: outputName(draft) },
  { label: 'Scene', value: draft.scene || 'Scene' },
  { label: 'Size', value: draft.preset ? `${streamPresets[draft.preset].width} × ${streamPresets[draft.preset].height}` : '1920 × 1080' },
];

async function addOutputs(draft: AddSourceDraft) {
  const model = attached;
  if (!model) return { say: 'Open Set up OBS first; nothing was added.' };
  if (draft.scene && !model.setScene(draft.scene)) return { say: 'That scene name was refused, so nothing was added.' };
  if (draft.preset && !model.setPreset(draft.preset)) return { say: 'That size was refused, so nothing was added.' };
  const rows = draft.all ? addable(model.getSnapshot().rows) : model.getSnapshot().rows.filter(row => row.id === draft.output);
  for (const row of rows) { await model.add(row.id); await settle(model); }
  const after = model.getSnapshot();
  const done = after.rows.filter(row => rows.some(item => item.id === row.id));
  const simulated = after.obs === 'simulated';
  const added = done.filter(row => row.phase === 'added');
  return { say: simulated ? `Simulated: ${added.length} source${added.length === 1 ? '' : 's'} would be added. No OBS source was created.`
    : added.length ? `Added ${added.length} source${added.length === 1 ? '' : 's'} to ${after.scene_name}. Inspect the placement in OBS.`
      : `Nothing was added: ${done[0]?.notice ?? 'OBS refused the source'}.`,
  lines: done.map(row => ({ label: row.name, value: row.notice ?? row.phase })) };
}

export const addSourceFlow = defineFlow<AddSourceDraft>({
  id: 'stream-add-source', chamber: 'stream', title: 'Add a source to OBS', chip: 'Add a source',
  intents: ['add source', 'browser source', 'add to obs', 'put on stream', 'overlay'],
  intro: 'One output into one OBS scene, at one size. Nothing reaches OBS until you hold.',
  initial: () => ({}),
  steps: [
    { id: 'output', kind: 'choice', label: 'Output', prompt: 'Which output goes into OBS?',
      options: () => addable(state()?.rows).slice(0, 5).map(row => ({ id: row.id, label: row.name, consequence: kindLine(row) })),
      apply: (draft, id) => ({ ...draft, output: id }) },
    ...sceneSteps,
    { id: 'seal', kind: 'confirm', label: 'Add', prompt: 'Hold to add it as a browser source.',
      note: 'A transparent browser source in that scene. Inspect its placement in OBS afterwards.', lines: confirmLines },
  ],
  seal: addOutputs,
});

export const addAllFlow = defineFlow<AddSourceDraft>({
  id: 'stream-add-all', chamber: 'stream', title: 'Add every output', chip: 'Add every output',
  intents: ['add all', 'every output', 'everything', 'all sources'],
  intro: 'Every output that is ready, into one scene at one size.',
  initial: () => ({ all: true }),
  steps: [
    ...sceneSteps,
    { id: 'look', kind: 'preview', label: 'Outputs', prompt: 'These are the outputs I would add.',
      lines: () => addable(state()?.rows).map(row => ({ label: row.name, value: kindLine(row) })) },
    { id: 'seal', kind: 'confirm', label: 'Add', prompt: 'Hold to add them all.',
      note: 'Each becomes a transparent browser source. The Lot plate waits for a sealed draw.', lines: confirmLines },
  ],
  seal: addOutputs,
});

/** Steward flows for stream setup (#/stream). */
export function streamSteward(snapshot: Snapshot): ChamberSteward {
  const fixture = snapshot.mode === 'fixture';
  const flows = [addSourceFlow, addAllFlow].map(flow => fixture ? { ...flow, simulated: true } : flow);
  return {
    name: 'stream setup', flows, keywords: ['obs', 'scene', 'stream setup', 'browser source'],
    greeting: 'Stream setup. Tell me what to put on stream; nothing changes in OBS until you hold to seal.',
    catch_up: () => {
      const now = state();
      if (!now) return { say: fixture ? 'Setup runs on sample data here. OBS is not connected.' : 'Setup reads the core for OBS status.', ...(fixture ? { simulated: true } : {}) };
      const added = now.rows.filter(row => row.phase === 'added');
      return { say: fixture ? 'A simulated setup: nothing reaches OBS.' : 'Here is OBS setup so far.', ...(fixture ? { simulated: true } : {}),
        lines: [{ label: 'OBS', value: now.obs }, { label: 'Scene', value: now.scene_name },
          { label: 'Size', value: `${streamPresets[now.preset].width} × ${streamPresets[now.preset].height}` },
          { label: 'Added', value: added.length ? added.map(row => row.name).join(', ') : 'Nothing yet' }] };
    },
  };
}
