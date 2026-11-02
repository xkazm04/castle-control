import type { Visual, VisualId, DesignId } from '@castle-control/contract';
import { defineFlow } from '@castle-control/ui/steward-flow';
import type { StewardFlow } from '@castle-control/ui/steward-flow';
import { source_labels } from './contribution-input.js';
import { curveConsequence, curveSteps, decayLabel, feeds, nightPhrase, nightTrace, strengthLabel, strengths, tunedVisual } from './flow-model.js';
import type { FeedId, StrengthId } from './flow-model.js';

/**
 * Core mode only: "Light a beacon" creates a new visual in the core through the
 * existing beacons.visual.upsert path. Three small choices draft it in the
 * chamber picture; the hold to seal is the only write.
 */
export const light_flow_id = 'visuals-light';
export type LookId = 'altar' | 'frame' | 'border';
export type LightDraft = { look?: LookId; feed?: FeedId; strength?: Exclude<StrengthId, 'keep'> };

export const looks: readonly { id: LookId; label: string; design_id?: string; line: string }[] = [
  { id: 'altar', label: 'Offering altar', design_id: 'preset-heraldic-altar', line: 'An object on screen that flares as support lands' },
  { id: 'frame', label: 'Camera frame', design_id: 'preset-heraldic-frame', line: 'A frame around your face cam that glows brighter' },
  { id: 'border', label: 'Screen border', line: 'A thin glow around the whole stream' },
];

/** The new visual as the draft would save it; ids never collide with the core's own. */
export function lightVisual(draft: LightDraft, existing: readonly Visual[]): Visual {
  const look = looks.find(item => item.id === draft.look) ?? looks[0]!;
  const taken = new Set(existing.map(item => item.visual_id as string));
  let index = 1;
  while (taken.has(index === 1 ? `${look.id}-beacon` : `${look.id}-beacon-${index}`)) index += 1;
  const visual_id = (index === 1 ? `${look.id}-beacon` : `${look.id}-beacon-${index}`) as VisualId;
  const base: Visual = { visual_id, name: index === 1 ? look.label : `${look.label} ${index}`,
    ...(look.design_id ? { design_id: look.design_id as DesignId } : {}),
    curve: { ranges: [{ total: 0, intensity: 0 }, { total: 50, intensity: 1 }], decay: { kind: 'none' } } };
  return tunedVisual(base, { feed: draft.feed ?? 'gift', strength: draft.strength ?? 'balanced', decay: 'medium' });
}

export type LightAccess = { visuals(): readonly Visual[]; save(visual: Visual): Promise<void> };

export function lightFlow(access: LightAccess): StewardFlow<LightDraft> {
  return defineFlow<LightDraft>({
    id: light_flow_id, chamber: 'visuals', title: 'Light a beacon', chip: 'Light a beacon',
    intents: ['light a beacon', 'new beacon', 'add a beacon', 'create a beacon', 'new visual', 'first beacon'],
    intro: 'A new beacon in your core: pick how it looks, what feeds it and how eagerly it answers. The picture above shows it as you choose. Nothing is saved until you hold to seal.',
    initial: () => ({}),
    steps: [
      { id: 'look', kind: 'preset', label: 'Look', prompt: 'How should it look on stream?',
        presets: () => looks.map(look => ({ id: look.id, label: look.label, consequence: look.line })),
        apply: (draft, id) => { const look = looks.find(item => item.id === id); return look ? { ...draft, look: look.id } : draft; } },
      { id: 'feed', kind: 'choice', label: 'Fed by', prompt: 'What should make it glow?',
        options: () => feeds.map(feed => ({ id: feed.id, label: feed.label,
          consequence: feed.counted ? 'Counts in test fires and in the sample nights' : 'Saved as its route; the sample nights count gift subs and subs only' })),
        apply: (draft, id) => { const feed = feeds.find(item => item.id === id); return feed ? { ...draft, feed: feed.id } : draft; } },
      { id: 'strength', kind: 'preset', label: 'Strength', prompt: 'How eagerly should it answer? Each card is measured against two generated nights.',
        presets: draft => strengths.filter(id => id !== 'keep').map(id => {
          const visual = lightVisual({ ...draft, strength: id }, access.visuals());
          return { id, label: strengthLabel(id), ...(id === 'balanced' ? { tag: 'suggested' } : {}),
            consequence: `Full at ${visual.curve.ranges.at(-1)?.total ?? 0} · ${curveConsequence(visual.curve)}` };
        }),
        apply: (draft, id) => { const strength = strengths.find(item => item === id); return strength && strength !== 'keep' ? { ...draft, strength } : draft; } },
      { id: 'seal', kind: 'confirm', label: 'Seal', prompt: 'Hold to seal: the core saves this beacon.',
        note: 'Saved to your core configuration on your hold. Money changes looks only; nothing reaches OBS until you add its browser source.',
        lines: draft => {
          const visual = lightVisual(draft, access.visuals());
          return [{ label: 'Beacon', value: visual.name },
            { label: 'Fed by', value: visual.input ? source_labels[visual.input.source] : 'Not routed' },
            { label: 'Curve', value: curveSteps(visual.curve) }, { label: 'Decay', value: decayLabel(visual.curve.decay) },
            { label: 'Sample night', value: nightPhrase(nightTrace(visual.curve, 'sample')) }];
        } },
    ],
    seal: async draft => {
      const visual = lightVisual(draft, access.visuals());
      await access.save(visual);
      return { say: `Lit. The ${visual.name.toLowerCase()} is in your core now. Test fire it to see it react, or copy its browser source from More.`,
        lines: [{ label: 'Kept', value: 'In the core configuration' }],
        chips: [{ label: 'Test fire', action: { kind: 'flow', chamber: 'visuals', flow: 'visuals-test-fire' } },
          { label: 'Tune a beacon', action: { kind: 'flow', chamber: 'visuals', flow: 'visuals-tune' } }] };
    },
  });
}
