import type { IntensityCurve, Visual, VisualId } from '@castle-control/contract';
import { proposalQueue } from '@castle-control/ui/steward';
import type { ProposalField, ProposalQueue } from '@castle-control/ui/steward';
import { fixtureVisuals } from '../../beacons-fixture.js';

type CurveDraft = Readonly<{ visual_id: VisualId; curve: IntensityCurve }>;
// Session-only memory of which curve each draft carries. The queue stays the one source of state.
const sessions = new WeakMap<ProposalQueue, Map<string, CurveDraft>>();
function drafts(queue: ProposalQueue): Map<string, CurveDraft> {
  let found = sessions.get(queue);
  if (!found) { found = new Map(); sessions.set(queue, found); }
  return found;
}

export const curveText = (curve: IntensityCurve) =>
  curve.ranges.map(point => `${point.total}→${Math.round(point.intensity * 100)}%`).join(' · ');
export const decayText = (decay: IntensityCurve['decay']) =>
  decay.kind === 'none' ? 'No decay' : `Halves every ${Math.round(decay.half_life_s / 6) / 10} min`;
export const sameCurve = (a: IntensityCurve, b: IntensityCurve) => JSON.stringify(a) === JSON.stringify(b);

/** The last curve the human sealed for this visual in this session, else its sample configuration. */
export function sealedCurve(visual_id: VisualId, queue: ProposalQueue = proposalQueue): IntensityCurve | undefined {
  const known = drafts(queue);
  const sealed = queue.getSnapshot().proposals.filter(proposal => proposal.chamber === 'visuals'
    && (proposal.state === 'sealed' || proposal.state === 'proclaimed') && known.get(proposal.id)?.visual_id === visual_id);
  const last = sealed.at(-1);
  return (last && known.get(last.id)?.curve) ?? fixtureVisuals.find(item => item.visual_id === visual_id)?.curve;
}

/** Whether a human sealed a curve for this visual in this session. */
export function sealedHere(visual_id: VisualId, queue: ProposalQueue = proposalQueue): boolean {
  const known = drafts(queue);
  return queue.getSnapshot().proposals.some(proposal => proposal.chamber === 'visuals'
    && (proposal.state === 'sealed' || proposal.state === 'proclaimed') && known.get(proposal.id)?.visual_id === visual_id);
}

/** The open curve draft for this visual, if the Steward queue holds one. */
export function openCurveDraft(visual_id: VisualId, queue: ProposalQueue = proposalQueue) {
  const known = drafts(queue);
  return queue.pending('visuals').find(proposal => known.get(proposal.id)?.visual_id === visual_id);
}

/** Hands the tuned curve to the Steward seal flow. Never a direct write: nothing changes until a human seals. */
export function proposeCurve(visual: Visual, replay: string, queue: ProposalQueue = proposalQueue) {
  const known = drafts(queue);
  const fields: ProposalField[] = [
    { key: 'visual', label: 'Visual', value: visual.name, struck: [] },
    { key: 'curve', label: 'Kindling curve · weighted subs → blaze', value: curveText(visual.curve), struck: [] },
    { key: 'decay', label: 'Decay', value: decayText(visual.curve.decay), struck: [] },
    { key: 'replay', label: 'Sample night replay', value: replay, struck: [] },
    { key: 'scope', label: 'Scope', value: 'SIMULATED · money affects visuals only · nothing on air', struck: [] },
  ];
  const open = openCurveDraft(visual.visual_id, queue);
  let id = open?.id ?? `visuals-curve-${visual.visual_id}-1`;
  for (let next = 2; !open && queue.getSnapshot().proposals.some(item => item.id === id); next++) {
    id = `visuals-curve-${visual.visual_id}-${next}`;
  }
  const result = queue.addOrUpdate({ id, chamber: 'visuals', kind: 'seal', title: `Blaze curve · ${visual.name}`,
    revision: 1, state: 'drafted', fields });
  if (result.ok) { known.set(id, { visual_id: visual.visual_id, curve: visual.curve }); queue.select(id); }
  return result;
}
