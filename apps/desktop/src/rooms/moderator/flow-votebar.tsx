import { proposalQueue } from '@castle-control/ui/steward';
import { defineFlow } from '@castle-control/ui/steward-flow';
import type { FlowLine } from '@castle-control/ui/steward-flow';
import type { Snapshot } from '../../model.js';
import { fixtureCharts } from '../../moderation-fixture.js';
import { presetsFor, presetUrl } from '../../custom-design/presets.js';
import { sealedLooks } from '../../custom-design/sealed.js';
import { consensusLabel } from './consensus.jsx';
import { VoteBarStage } from './herald.jsx';
import type { VoteLook } from './herald.jsx';
import { moderationSession } from './session.js';

/** "Vote bar on stream": what the herald counts -> where the bar sits -> its art -> preview -> seal. */
type PlacementId = 'lower' | 'banner' | 'corner';
/** `art` is a library vote-bar preset id: the housing the bar wears. */
export type VoteDraft = { shows?: number; placement?: PlacementId; art?: string };

const placements: readonly { id: PlacementId; label: string; consequence: string; look: Pick<VoteLook, 'anchor' | 'size'> }[] = [
  { id: 'lower', label: 'Lower right, medium', consequence: 'Out of the way of a facecam on the left.', look: { anchor: 'bottom-right', size: 'M' } },
  { id: 'banner', label: 'Across the top, large', consequence: 'The vote is the show: wide and readable.', look: { anchor: 'top-left', size: 'L' } },
  { id: 'corner', label: 'Small, lower left', consequence: 'A quiet tally for long streams.', look: { anchor: 'bottom-left', size: 'S' } },
];
const offered = presetsFor('vote_bar');
const artName = (id: string | undefined) => offered.find(item => item.id === id)?.style_name;

const session = () => moderationSession(proposalQueue);
/** The look the stage draws for a draft: chosen values over the session's current vote layer. */
export function voteLook(draft: VoteDraft | undefined): VoteLook {
  const current = session().output.getSnapshot().vote;
  const placement = placements.find(item => item.id === draft?.placement)?.look;
  const art = draft?.art ?? sealedLooks.get().vote_bar;
  return { anchor: placement?.anchor ?? current.anchor, size: placement?.size ?? current.size,
    art_style: current.art_style, colour: current.colour, ...(art ? { art } : {}) };
}
const shows = (draft: VoteDraft) => draft.shows ?? session().view.getSnapshot().filter;
function counted(draft: VoteDraft): string {
  const result = fixtureCharts[shows(draft)];
  return result ? consensusLabel(result) : 'All messages';
}
const lines = (draft: VoteDraft, core: boolean): FlowLine[] => [
  { label: 'Counts', value: core ? 'The core’s consensus window' : counted(draft) },
  { label: 'Placement', value: placements.find(item => item.id === draft.placement)?.label ?? 'As it is' },
  { label: 'Art', value: artName(draft.art) ?? 'As it is' },
  { label: 'On seal', value: core ? `${draft.art ? 'Dresses the bar in the library art, then copies' : 'Copies'} the vote-bar browser source URL for OBS`
    : 'Updates this session’s preview; no OBS source in fixture mode' },
];

export function voteRibbon(draft: VoteDraft): string {
  return ['Vote bar on stream', draft.shows === undefined ? undefined : `counts ${counted(draft).toLowerCase()}`,
    placements.find(item => item.id === draft.placement)?.label.toLowerCase(), artName(draft.art)]
    .filter(Boolean).join(' · ') + ' · preview in the herald below';
}

export function voteBarFlow(snapshot: Snapshot) {
  const core = snapshot.mode === 'core';
  return defineFlow<VoteDraft>({
    id: 'gatehouse-votebar', chamber: 'moderator', title: 'Vote bar on stream', chip: 'Show the vote bar', simulated: !core,
    intents: ['vote bar', 'vote', 'poll', 'overlay', 'herald', 'obs source', 'browser source', 'consensus', 'make the bar', 'bar bigger', 'bar smaller', 'bar size'],
    intro: 'Let us put the herald on stream: what it counts, where the bar sits, how it looks. Nothing reaches OBS until you seal.',
    initial: () => ({}),
    steps: [
      { id: 'shows', kind: 'choice', label: 'Counts', prompt: 'What should the herald count for the bar?',
        when: () => !core,
        options: () => fixtureCharts.map((result, index) => ({ id: String(index), label: consensusLabel(result),
          consequence: `${result.directions[0]?.label ?? 'No direction'} leads at ${((result.directions[0]?.share ?? 0) * 100).toFixed(1)}%` })),
        apply: (draft, id) => fixtureCharts[Number(id)] ? { ...draft, shows: Number(id) } : draft },
      { id: 'placement', kind: 'preset', label: 'Placement', prompt: 'Where does it sit on your stream?',
        presets: () => placements.map(item => ({ id: item.id, label: item.label, consequence: item.consequence })),
        apply: (draft, id) => { const placement = placements.find(item => item.id === id)?.id; return placement ? { ...draft, placement } : draft; } },
      { id: 'style', kind: 'choice', label: 'Art', prompt: 'Which art dresses the bar? Ready-made library presets; Custom design makes your own.',
        options: () => offered.map(item => ({ id: item.id, label: item.style_name, picture: { src: presetUrl(item), alt: `${item.style_name} vote bar` } })),
        apply: (draft, id) => { const art = offered.find(item => item.id === id)?.id; return art ? { ...draft, art } : draft; } },
      { id: 'look', kind: 'preview', label: 'Preview', prompt: 'This is the bar on a 16:9 canvas. The herald above shows it live.',
        render: draft => <VoteBarStage directions={(fixtureCharts[shows(draft)] ?? fixtureCharts[0])?.directions ?? []} look={voteLook(draft)} draft /> },
      { id: 'seal', kind: 'confirm', label: 'Seal', prompt: core ? 'Hold to seal and copy the browser source.' : 'Hold to seal the vote bar look.',
        lines: draft => lines(draft, core),
        note: core ? 'Add it in OBS as a Browser source. Aggregate shares only; no chat text reaches the page.'
          : 'SIMULATED · session preview only. No OBS source is created in fixture mode.' },
    ],
    seal: async draft => {
      if (core) {
        const { gatehousePort } = await import('./core-port.js');
        const port = gatehousePort(snapshot);
        if (!port) throw new Error('The Gatehouse core connection is unavailable.');
        if (draft.art) {
          const { beaconsPort } = await import('../../custom-design/seal.js');
          let design_id;
          try { design_id = (await (await beaconsPort(snapshot)).importLibrary(draft.art, 'vote_bar')).design_id; }
          catch { throw new Error('The core could not take the library art. Nothing changed.'); }
          await port.setVoteBarDesign(design_id);
          if (port.getSnapshot().phase === 'error') throw new Error(port.getSnapshot().notice);
        }
        await port.copyVoteBarSource();
        if (port.getSnapshot().phase === 'error') throw new Error(port.getSnapshot().notice);
        return { say: 'Copied the vote-bar browser source URL. In OBS, add a Browser source and paste it.', lines: lines(draft, true) };
      }
      const { output, view } = session();
      const look = voteLook(draft);
      output.update('vote', 'anchor', look.anchor); output.update('vote', 'size', look.size);
      if (draft.art) sealedLooks.set('vote_bar', draft.art);
      if (draft.shows !== undefined) view.setFilter(draft.shows);
      return { say: 'Sealed. The herald and its vote bar preview follow your choice for this session. No OBS source in fixture mode.',
        lines: lines(draft, false) };
    },
  });
}
