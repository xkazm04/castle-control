import { proposalQueue } from '@castle-control/ui/steward';
import { defineFlow } from '@castle-control/ui/steward-flow';
import type { FlowLine } from '@castle-control/ui/steward-flow';
import type { Snapshot } from '../../model.js';
import { fixtureCandidate, fixtureDelay, fixtureReplay } from '../../moderation-fixture.js';
import { moderationSession } from './session.js';

/** "Practice a drill": the existing replay drill as a guided flow. Practice only; nothing reaches chat. */
type Night = 'sample' | 'busy';
export type DrillDraft = { night?: Night; compare?: boolean };
const drillHash = '#/chamber/moderator/drill';

const summary = fixtureReplay.summary;
function brief(draft: DrillDraft, core: boolean): FlowLine[] {
  if (core) return [{ label: 'Recording', value: 'Chosen in the drill: import one, or pick a retained capture' },
    { label: 'Writes', value: 'Nothing: replays never touch the live decision ledger' }];
  return [
    { label: 'Recording', value: draft.night === 'busy' ? 'Busy night · 2,000 simulated lines' : `Sample night · ${fixtureReplay.outcomes.length} simulated lines` },
    { label: 'Beside', value: draft.compare ? `Candidate rules · ${fixtureCandidate.changes.length} changed outcomes` : 'Nothing: as recorded' },
    { label: 'Chat delay', value: `${fixtureDelay.delay_s} s at the moat` },
    ...(draft.night === 'busy' ? [] : [{ label: 'Over-moderation', value: `${summary.over_moderation.false_positives} of ${summary.over_moderation.evaluated} evaluated` }]),
  ];
}

/** The chamber picture while the flow is open: the drill as planned so far. */
export function DrillPicture({ draft }: { draft: DrillDraft }) {
  return <div className="gh-rules-picture">
    <p className="gh-rules-picture__head"><span className="cc-stamp cc-stamp--draft">Draft</span><b>Practice drill</b>
      <span>generated recording · practice only</span></p>
    <dl className="gh-brief">{brief(draft, false).map(line => <div key={line.label}><dt>{line.label}</dt><dd>{line.value}</dd></div>)}</dl>
  </div>;
}

export function drillRibbon(draft: DrillDraft): string {
  return ['Practice a drill', draft.night === 'busy' ? 'busy night' : draft.night ? 'sample night' : undefined,
    draft.compare === undefined ? undefined : draft.compare ? 'beside candidate rules' : 'as recorded'].filter(Boolean).join(' · ');
}

export function drillFlow(snapshot: Snapshot) {
  const core = snapshot.mode === 'core';
  return defineFlow<DrillDraft>({
    id: 'gatehouse-drill', chamber: 'moderator', title: 'Practice a drill', chip: 'Practice a drill', simulated: true,
    intents: ['drill', 'practice', 'replay', 'rehearse moderation', 'test the rules'],
    intro: 'A drill replays a generated night through the gate so you can see what the rules would have done. Practice only.',
    initial: () => ({}),
    steps: [
      { id: 'night', kind: 'choice', label: 'Night', prompt: 'Which simulated night do you want to replay?', when: () => !core,
        options: () => [
          { id: 'sample', label: 'Sample night', consequence: `${fixtureReplay.outcomes.length} lines, with a recording gap to spot` },
          { id: 'busy', label: 'Busy night', consequence: '2,000 lines: how the moat looks under load' }],
        apply: (draft, id) => id === 'sample' || id === 'busy' ? { ...draft, night: id } : draft },
      { id: 'compare', kind: 'choice', label: 'Beside', prompt: 'Replay it as recorded, or beside candidate rules?',
        when: draft => !core && draft.night === 'sample',
        options: () => [
          { id: 'no', label: 'As recorded', consequence: 'One moat: every line and the verdict it got' },
          { id: 'yes', label: 'Beside candidate rules', consequence: `Two moats: ${fixtureCandidate.changes.length} outcomes would change` }],
        apply: (draft, id) => ({ ...draft, compare: id === 'yes' }) },
      { id: 'brief', kind: 'preview', label: 'Brief', prompt: 'Here is the drill. It opens in the Gatehouse’s drill room.',
        lines: draft => brief(draft, core), continue_label: 'Ready' },
      { id: 'seal', kind: 'confirm', label: 'Start', prompt: 'Hold to start the drill.', lines: draft => brief(draft, core),
        note: 'A generated recording replayed locally. Nothing reaches chat or the live ledger.' },
    ],
    seal: draft => {
      if (!core) moderationSession(proposalQueue).view.planDrill({ busy: draft.night === 'busy', compare: draft.compare === true });
      window.location.hash = drillHash;
      return { say: 'The drill is open. Pick a stamp on the moat to see why a line passed, waited or was barred.', lines: brief(draft, core) };
    },
  });
}
