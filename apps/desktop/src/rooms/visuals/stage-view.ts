import type { IntensityCurve, Visual } from '@castle-control/contract';
import type { DraftPublication } from '@castle-control/ui/steward-flow';
import type { PreviewVisual } from '../../beacons-model.js';
import { curveIntensity } from '../../beacons-model.js';
import type { NightId } from '../../beacons-nights.js';
import { demoCases, fittedCurve, shotResult, shots, tunedVisual } from './flow-model.js';
import type { DemoDraft, ReplayDraft, TestDraft, TuneDraft } from './flow-model.js';

export const flow_ids = { tune: 'visuals-tune', test: 'visuals-test-fire', replay: 'visuals-replay', demo: 'visuals-demo' } as const;

/** What the chamber picture shows: the beacon at rest, a flow's draft, or a night playing. */
export type StageView = {
  item: PreviewVisual;
  /** rest: the room as it is. draft: a flow's unsealed choice. night: a generated night plays. */
  mode: 'rest' | 'draft' | 'night';
  /** The flow that owns the picture, if any. */
  flow?: string;
  night?: NightId;
  /** Sparkline night when nothing plays: the sample night. */
  spark: NightId;
  stamp?: string;
  simulated: boolean;
  /** Test fire draft: the intensity before the predicted contribution. */
  before?: number;
  shot?: string;
};

function withCurve(item: PreviewVisual, visual: Visual, curve: IntensityCurve = visual.curve): PreviewVisual {
  const next = { ...visual, curve };
  return { ...item, visual: next, intensity: curveIntensity(curve, item.total) };
}

/** Pure: the same snapshot and draft always draw the same picture. */
export function stageView(visuals: readonly PreviewVisual[], selected: string, publication: DraftPublication | undefined): StageView {
  const fallback = visuals.find(item => item.visual.visual_id === selected) ?? visuals[0];
  if (!fallback) throw new Error('No beacon visual to draw');
  const rest: StageView = { item: fallback, mode: 'rest', spark: 'sample', simulated: true };
  if (!publication) return rest;
  const pick = (id: string | undefined) => visuals.find(item => item.visual.visual_id === id) ?? fallback;
  const draftWord = publication.simulated ? 'Simulated draft · not on air' : 'Draft · not on air';
  const base = { flow: publication.flow, simulated: true, stamp: draftWord } as const;
  switch (publication.flow) {
    case flow_ids.tune: {
      const draft = publication.draft as TuneDraft;
      const item = pick(draft.visual);
      const visual = tunedVisual(item.visual, draft);
      const playing = publication.step === 'night' || publication.step === 'seal';
      return { ...base, item: withCurve(item, visual), mode: playing ? 'night' : 'draft', spark: 'sample', ...(playing ? { night: 'sample' as const } : {}) };
    }
    case flow_ids.test: {
      const draft = publication.draft as TestDraft;
      const item = pick(draft.visual);
      if (!draft.shot) return { ...base, item, mode: 'draft', spark: 'sample' };
      const result = shotResult(item.visual.curve, item.total, item.gift_weight, draft.shot);
      return { ...base, item: { ...item, total: result.total, intensity: result.after }, mode: 'draft', spark: 'sample',
        before: result.before, shot: shots.find(shot => shot.id === draft.shot)?.label ?? '', stamp: 'Simulated test · not fired yet' };
    }
    case flow_ids.replay: {
      const draft = publication.draft as ReplayDraft;
      const item = pick(draft.visual);
      if (!draft.night) return { ...base, item, mode: 'draft', spark: 'sample' };
      const curve = draft.move === 'fit' ? fittedCurve(item.visual.curve, draft.night, item.gift_weight) : item.visual.curve;
      return { ...base, item: withCurve(item, item.visual, curve), mode: 'night', night: draft.night, spark: draft.night };
    }
    case flow_ids.demo: {
      const draft = publication.draft as DemoDraft;
      const found = demoCases.find(item => item.id === draft.case);
      if (!found) return { ...rest, flow: publication.flow, stamp: 'Simulated demo' };
      const item = pick(found.visual);
      const curve = draft.move === 'fit' ? fittedCurve(item.visual.curve, found.night, item.gift_weight) : item.visual.curve;
      return { ...base, item: withCurve(item, item.visual, curve), mode: 'night', night: found.night, spark: found.night, stamp: 'Simulated demo night' };
    }
    default: return rest;
  }
}
