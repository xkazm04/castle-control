import { chambers } from '@castle-control/ui';
import type { ModuleId } from '@castle-control/ui';
import { isPending, proposalQueue } from '@castle-control/ui/steward';
import { defineFlow, stewardDock } from '@castle-control/ui/steward-flow';
import type { ChamberSteward, DockStore, StewardChip } from '@castle-control/ui/steward-flow';
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

/** One chip per chamber: navigates there and opens that chamber's own Play demo at its first step. */
export const tourDemoChips = (): StewardChip[] => chambers.map(chamber => ({
  label: `Play the ${chamber.name} demo`, action: { kind: 'demo', chamber: chamber.id } }));

/** After the tour's own sealed beat lands, the Steward offers the four demos as chips. */
export function offerTourDemos(store: Pick<DockStore, 'say'> = stewardDock) {
  setTimeout(() => {
    store.say({ chamber: 'keep', who: 'steward', simulated: true, text: 'Pick a chamber: I open it with its demo ready to play.', chips: tourDemoChips() });
  }, 0);
}

/** The Keep's Play demo: a three-beat tour that lights each chamber and points at its own Play demo. */
export type KeepTourDraft = { lit?: ModuleId; done?: boolean };
const tourLine = (id: ModuleId) => `${chamberName(id)}: press ${chambers.find(chamber => chamber.id === id)?.number ?? ''}, then Play demo`;
export const keepTourFlow = defineFlow<KeepTourDraft>({
  id: 'keep-tour', chamber: 'keep', title: 'What is Castle Control?', simulated: true,
  intents: ['what is castle control', 'tour', 'show me around', 'demo', 'what can you do'],
  intro: 'Castle Control runs the interactive parts of a Twitch stream from one place: fair giveaways, calmer moderation, visuals that answer support, and chat votes. Three short beats; every number here is SIMULATED.',
  initial: () => ({}),
  steps: [
    { id: 'start', kind: 'choice', label: 'Tour', prompt: 'Four chambers, one Steward. Nothing reaches your stream until you hold to seal. Shall we start where most evenings start?',
      options: () => [{ id: 'lottery', label: 'Start with the Lot Chamber', consequence: 'Giveaways and draws. The Keep lights it above.' }],
      apply: draft => ({ ...draft, lit: 'lottery' }) },
    { id: 'lots', kind: 'choice', label: 'Lot Chamber', prompt: 'Beat one, the Lot Chamber: free entry, equal odds, and a draw anyone can check afterwards against a public random round.',
      options: () => [{ id: 'moderator', label: 'Next: the Gatehouse', consequence: `Later: ${tourLine('lottery')}.` }],
      apply: draft => ({ ...draft, lit: 'moderator' }) },
    { id: 'gate', kind: 'choice', label: 'Gatehouse', prompt: 'Beat two, the Gatehouse: an AI moderator that holds what it is unsure of and lets you decide, with a chat delay as the moat.',
      options: () => [{ id: 'visuals', label: 'Next: Beacons and the Map Room', consequence: `Later: ${tourLine('moderator')}.` }],
      apply: draft => ({ ...draft, lit: 'visuals' }) },
    { id: 'beacons', kind: 'choice', label: 'Beacons', prompt: 'Beat three: Beacons turn subs and cheers into how the stream looks, never what it decides. The Map Room runs chat duels: two contestants, one tally, chat picks the winner.',
      options: () => [{ id: 'studio', label: 'Show me the Map Room', consequence: `Later: ${tourLine('visuals')}.` }],
      apply: draft => ({ ...draft, lit: 'studio' }) },
    { id: 'end', kind: 'confirm', label: 'End of tour', prompt: "That is the keep. Hold to finish; then try any chamber's own Play demo.",
      note: 'A tour only. Nothing was drafted, sent or sealed.',
      lines: () => chambers.map(chamber => ({ label: chamber.name, value: `Press ${chamber.number}, then Play demo` })) },
  ],
  seal: () => {
    offerTourDemos();
    return { say: 'Tour done. Each chamber plays its own SIMULATED case end to end in about a minute: choose one below, or open one with 1 to 4 and choose Play demo.',
      lines: chambers.map(chamber => ({ label: chamber.name, value: `Press ${chamber.number}, then Play demo` })) };
  },
});

export function keepSteward(snapshot: Snapshot): ChamberSteward {
  const read = keepReadModel(snapshot);
  const fixture = snapshot.mode === 'fixture';
  return {
    name: 'the Keep',
    greeting: 'Good evening. Draft in the preview, amend in ink, then hold to seal. Nothing acts on a spoken request.',
    flows: [keepThemeFlow],
    demo: keepTourFlow,
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
