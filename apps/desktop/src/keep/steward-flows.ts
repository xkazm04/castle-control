import { chambers } from '@castle-control/ui';
import type { ModuleId } from '@castle-control/ui';
import { isPending, proposalQueue } from '@castle-control/ui/steward';
import { defineFlow } from '@castle-control/ui/steward-flow';
import type { ChamberSteward } from '@castle-control/ui/steward-flow';
import { fixtureVisuals } from '../beacons-fixture.js';
import type { Snapshot } from '../model.js';
import { keepReadModel } from './read-model.js';

/** Reference flow: choice -> choice -> preview -> confirm, on fixture data only. */
export type KeepThemeDraft = { lead?: ModuleId; dressing?: string };

const fixtureRead = keepReadModel({ mode: 'fixture', phase: 'ready' });
const sourceLine: Record<string, string> = {
  channel_points: 'Channel points feed it', gift: 'Gift subs feed it', hype_train: 'Hype trains feed it',
};
const chamberName = (id: ModuleId | undefined) => chambers.find(chamber => chamber.id === id)?.name ?? 'Not chosen';
const visualName = (id: string | undefined) => fixtureVisuals.find(visual => visual.visual_id === id)?.name ?? 'Not chosen';

/** A sealed plan is kept on this machine only; it is a sample, nothing is sent. */
let tonight: Required<KeepThemeDraft> | undefined;
export const keepTonight = () => tonight;

export const keepThemeFlow = defineFlow<KeepThemeDraft>({
  id: 'keep-theme', chamber: 'keep', title: "Pick tonight's theme", chip: "Pick tonight's theme", simulated: true,
  intents: ['theme', 'tonight', 'plan the evening', 'open with'],
  intro: "Let's dress tonight. Two choices, then you look it over. Nothing acts until you hold to seal.",
  initial: () => ({}),
  steps: [
    { id: 'lead', kind: 'choice', label: 'Opens with', prompt: 'Which chamber opens the evening? The Keep lights it as you choose.',
      options: () => chambers.map(chamber => ({ id: chamber.id, label: chamber.name, tag: fixtureRead.states[chamber.id].word,
        consequence: fixtureRead.states[chamber.id].line })),
      apply: (draft, id) => {
        const lead = chambers.find(chamber => chamber.id === id)?.id;
        return lead ? { ...draft, lead } : draft;
      } },
    { id: 'dressing', kind: 'choice', label: 'Beacon', prompt: 'And which beacon dresses the stream while it runs?',
      options: () => fixtureVisuals.map(visual => ({ id: visual.visual_id, label: visual.name,
        consequence: sourceLine[visual.input?.source ?? ''] ?? 'Contributions feed it' })),
      apply: (draft, id) => ({ ...draft, dressing: id }) },
    { id: 'look', kind: 'preview', label: 'Preview', prompt: 'Here is the evening as it stands. The Keep shows the lit room above.',
      lines: draft => [
        { label: 'Opens with', value: chamberName(draft.lead) },
        { label: 'Beacon', value: visualName(draft.dressing) },
        { label: 'Then', value: draft.lead ? fixtureRead.states[draft.lead].line : 'Choose a chamber' },
      ] },
    { id: 'seal', kind: 'confirm', label: 'Seal', prompt: 'Hold to seal tonight\'s theme.',
      note: 'A sample plan on this machine. Nothing is sent to OBS or chat.',
      lines: draft => [{ label: 'Opens with', value: chamberName(draft.lead) }, { label: 'Beacon', value: visualName(draft.dressing) }] },
  ],
  seal: draft => {
    if (!draft.lead || !draft.dressing) throw new Error('Incomplete theme');
    tonight = { lead: draft.lead, dressing: draft.dressing };
    return { say: `Sealed. Tonight opens in the ${chamberName(draft.lead)}, dressed with the ${visualName(draft.dressing)}.`,
      lines: [{ label: 'Kept', value: 'On this machine only' }] };
  },
});

export function keepSteward(snapshot: Snapshot): ChamberSteward {
  const read = keepReadModel(snapshot);
  const fixture = snapshot.mode === 'fixture';
  return {
    name: 'the Keep',
    greeting: 'Good evening. Draft in the preview, amend in ink, then hold to seal. Nothing acts on a spoken request.',
    flows: [keepThemeFlow],
    keywords: ['keep', 'overview'],
    catch_up: () => {
      const pending = proposalQueue.pending().filter(isPending).length;
      return {
        say: `${fixture ? 'A sample evening' : 'The evening so far'}: ${pending ? `${pending} draft${pending === 1 ? '' : 's'} await your seal` : 'nothing awaits your seal'}.`,
        lines: [...chambers.map(chamber => ({ label: chamber.name, value: `${read.states[chamber.id].word} · ${read.states[chamber.id].line}` })),
          { label: 'Chat delay', value: read.delay }],
        ...(fixture ? { simulated: true } : {}),
      };
    },
  };
}
