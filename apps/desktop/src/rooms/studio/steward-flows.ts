import { createElement } from 'react';
import { parseDuelList, SAMPLE } from '@castle-control/duel';
import { defineFlow, stewardDock } from '@castle-control/ui/steward-flow';
import type { ChamberSteward, FlowLine, StewardFlow } from '@castle-control/ui/steward-flow';
import type { Snapshot } from '../../model.js';
import { roomSteward } from '../../shell/steward-room.js';
import { DEMO_KEY, duelHost, duelSandbox, runCore } from './duel-host.js';
import { draftPicture, entryIds, parseEntries, pictureLine, roundName } from './duel-model.js';
import type { DuelDraft, DuelEntry } from './duel-model.js';

/**
 * Map Room Steward: the duel's setup lives here, one decision at a time.
 * Every draft shows on the duel stage above, marked DRAFT; nothing starts
 * until the confirm card's hold to seal. FIXTURE seals start the TS engine
 * with generated SIMULATED ballots; CORE seals start the core tournament
 * through maproom.turn.run.
 */
type Mode = 'fixture' | 'core';
const entries = (items: readonly { title: string; by: string; note?: string }[]): DuelEntry[] =>
  items.map(item => ({ title: item.title, by: item.by, ...(item.note ? { note: item.note } : {}) }));
const presets: Readonly<Record<string, DuelDraft>> = {
  mill: { preset: 'mill', title: SAMPLE.chat.title, ...(SAMPLE.chat.prompt ? { prompt: SAMPLE.chat.prompt } : {}),
    entries: entries(SAMPLE.chat.items), window_s: 15 },
  bosses: { preset: 'bosses', title: SAMPLE.bracket.title, ...(SAMPLE.bracket.prompt ? { prompt: SAMPLE.bracket.prompt } : {}),
    entries: entries(SAMPLE.bracket.items), window_s: 15 },
  custom: { preset: 'custom', title: 'Your duel', entries: [], window_s: 15 },
};
const demoDraft: DuelDraft = { ...presets.mill!, demo: true };
const empty: DuelDraft = { title: '', entries: [], window_s: 15 };

const firstPair = (draft: DuelDraft) => {
  const picture = draftPicture(draft);
  return picture.left && picture.right ? `${picture.left.title} v ${picture.right.title}` : 'Name the contestants first';
};
const shape = (count: number) => count === 2 ? 'one match, the final' : count === 4 ? 'three matches: semifinals, then the final'
  : 'seven matches: quarterfinals, semifinals, the final';
const keyFor = (draft: DuelDraft) => draft.demo ? DEMO_KEY : draft.preset === 'mill' ? 'mill' : 'duel';

function seedList(draft: DuelDraft) {
  return createElement('ol', { className: 'duel-flow-seeds', 'aria-label': 'Seeding' },
    draft.entries.map((entry, index) => createElement('li', { key: index }, createElement('b', null, String(index + 1)), entry.title)));
}

function draftLines(draft: DuelDraft, mode: Mode): FlowLine[] {
  return [
    { label: 'Question', value: draft.prompt ?? draft.title },
    { label: 'Contestants', value: `${draft.entries.length} · ${shape(draft.entries.length)}` },
    { label: 'First match', value: `${roundName(draft.entries.length, 0)} · ${firstPair(draft)}` },
    { label: 'Vote window', value: `${draft.window_s} s per match${draft.demo ? ' · three times speed' : ''}` },
    { label: 'Ballots', value: mode === 'core' ? 'Chat ballots after the Gatehouse, counted by the core' : 'SIMULATED · generated on this machine' },
  ];
}

async function startDuel(draft: DuelDraft, mode: Mode) {
  // The demo always runs in the local sandbox; in core mode the core tournament is never touched.
  if (draft.demo && mode === 'core') duelSandbox.set(true);
  if (mode === 'core' && !draft.demo) {
    const { draftTournament } = await import('./duel-actions.js');
    await runCore(draftTournament(draft, keyFor(draft)));
    return;
  }
  const { fixtureDuel } = await import('./duel-fixture.js');
  const ids = entryIds(draft.entries);
  const list = parseDuelList({ title: draft.title, ...(draft.prompt ? { prompt: draft.prompt } : {}),
    items: draft.entries.map((entry, index) => ({ id: ids[index], title: entry.title, by: entry.by ?? 'streamer',
      ...(entry.note ? { note: entry.note } : {}) })) });
  fixtureDuel.start(list, { window_ms: draft.window_s * 1000, key: keyFor(draft), open: true, ...(draft.demo ? { speed: 3 as const } : {}) });
}

function buildStartFlow(mode: Mode): StewardFlow<DuelDraft> {
  return defineFlow<DuelDraft>({
    id: 'studio-duel', chamber: 'studio', title: 'Start a duel', chip: 'Start a duel', simulated: mode === 'fixture',
    intents: ['duel', 'tournament', 'bracket', 'start a duel', 'versus', 'chat decides', 'vote between'],
    intro: 'A duel: chat votes between two contestants at a time until one is champion. Pick a list; the first match shows on the stage above as a draft.',
    initial: () => empty,
    steps: [
      { id: 'list', kind: 'preset', label: 'List', prompt: 'Which list goes to the lists tonight?',
        presets: () => [
          { id: 'mill', label: 'The mill question', tag: 'SAMPLE', simulated: true, consequence: '4 starter contestants · semifinals, then the final' },
          { id: 'bosses', label: 'Best boss fight', tag: 'SAMPLE', simulated: true, consequence: '8 starter contestants · quarterfinals first' },
          { id: 'custom', label: 'Your own list', consequence: 'Name 2, 4 or 8 contestants yourself' },
        ],
        apply: (_draft, id) => presets[id] ?? empty },
      { id: 'question', kind: 'field', label: 'Question', when: draft => draft.preset === 'custom',
        prompt: 'What should chat decide? One short line; it heads the stage and the OBS source.',
        placeholder: 'Which snack wins the night?',
        validate: raw => raw.trim() ? raw.trim().length > 120 ? 'Keep the question to 120 characters.' : null : 'Write the question chat answers.',
        apply: (draft, raw) => ({ ...draft, title: raw.trim(), prompt: raw.trim() }) },
      { id: 'roster', kind: 'choice', label: 'Contestants', when: draft => draft.preset !== 'custom',
        prompt: 'These are seeded in order: the top seed meets the bottom seed first.',
        options: draft => [
          { id: 'keep', label: `Keep these ${draft.entries.length}`, consequence: `First match: ${firstPair(draft)}` },
          { id: 'edit', label: 'Edit the entries', consequence: 'Rename, reorder (reseeds), or cut to 2 or 4' },
        ],
        summary: (draft, id) => id === 'keep' ? `${draft.entries.length} as seeded` : 'edited',
        apply: (draft, id) => ({ ...draft, edit: id === 'edit' }) },
      { id: 'entries', kind: 'field', label: 'Entries', when: draft => draft.preset === 'custom' || draft.edit === true,
        prompt: 'Contestants in seed order, separated by ";". Two, four or eight.',
        placeholder: 'Crisps; Popcorn; Pretzels; Grapes',
        hint: 'Seed 1 is first. The stage above redraws the first match as you seal each change.',
        initial: draft => draft.entries.map(entry => entry.title).join('; '),
        validate: raw => { const parsed = parseEntries(raw); return 'error' in parsed ? parsed.error : null; },
        summary: draft => `${draft.entries.length} named`,
        apply: (draft, raw) => {
          const parsed = parseEntries(raw);
          if ('error' in parsed) return draft;
          const known = new Map(draft.entries.map(entry => [entry.title.toLowerCase(), entry]));
          return { ...draft, entries: parsed.entries.map(title => known.get(title.toLowerCase()) ?? { title, by: 'streamer' }) };
        } },
      { id: 'window', kind: 'choice', label: 'Window', prompt: 'How long does chat get for each match?',
        options: () => [
          { id: '15', label: '15 seconds', consequence: 'Brisk: a match a minute with the verdict' },
          { id: '30', label: '30 seconds', consequence: 'Room for a slow chat to arrive' },
          { id: '60', label: '60 seconds', consequence: 'A long debate per match' },
        ],
        apply: (draft, id) => ({ ...draft, window_s: Number(id) }) },
      { id: 'first', kind: 'preview', label: 'Preview', continue_label: 'Looks right',
        prompt: 'The first match stands on the stage above, marked DRAFT. Nothing has started.',
        lines: draft => draftLines(draft, mode), render: seedList },
      { id: 'seal', kind: 'confirm', label: 'Seal',
        prompt: mode === 'core' ? 'Hold to seal: the core starts this tournament and opens the first vote.'
          : 'Hold to seal: the duel starts here and opens the first vote.',
        note: mode === 'core' ? 'Replaces any tournament on the core. Duel on stream shows it in OBS.'
          : 'Fixture mode: SIMULATED ballots on this machine. Nothing reaches chat or OBS.',
        lines: draft => draftLines(draft, mode) },
    ],
    seal: async draft => {
      await startDuel(draft, mode);
      // Lower the sheet so the stage is the picture again; the receipt stays in the dock line.
      stewardDock.collapse();
      return { say: `Sealed. ${draft.prompt ?? draft.title}: ${firstPair(draft)} is open for votes.`,
        lines: [{ label: 'Runs on', value: mode === 'core' ? 'The core tournament' : 'This machine · SIMULATED ballots' }] };
    },
  });
}

type StreamDraft = { how?: 'copy' | 'stream' };
function buildStreamFlow(mode: Mode): StewardFlow<StreamDraft> {
  return defineFlow<StreamDraft>({
    id: 'studio-duel-stream', chamber: 'studio', title: 'Duel on stream', chip: 'Show the duel on stream', simulated: mode === 'fixture',
    intents: ['duel on stream', 'duel source', 'duel overlay', 'show the duel'],
    intro: 'Duel on stream is an OBS browser source that shows the current match, its tally and its timer.',
    initial: () => ({}),
    steps: [
      { id: 'look', kind: 'preview', label: 'Source', continue_label: 'Go on',
        prompt: 'This is what viewers see: the same match as the stage above.',
        lines: () => [
          { label: 'Shows', value: duelHost.picture() ? pictureLine(duelHost.picture()!) : 'Waiting for a tournament' },
          { label: 'Address', value: mode === 'core' ? 'Resolved by the core when you seal' : 'None in fixture mode: no live source exists' },
        ] },
      { id: 'how', kind: 'choice', label: 'Add', prompt: 'How do you want it in OBS?',
        options: () => [
          { id: 'copy', label: 'Copy the browser-source URL', consequence: mode === 'core' ? 'Paste it into a new OBS browser source' : 'Fixture mode: nothing to copy, shown as a dry run' },
          { id: 'stream', label: 'Add it from Stream setup', consequence: mode === 'core' ? 'Pick a size there and hold to add the Duel row' : 'Stream setup lists the Duel row in core mode only' },
        ],
        apply: (draft, id) => ({ ...draft, how: id === 'stream' ? 'stream' : 'copy' }) },
      { id: 'seal', kind: 'confirm', label: 'Seal', prompt: 'Hold to seal.',
        note: mode === 'core' ? 'Copying writes only to your clipboard; OBS changes happen in Stream setup.' : 'SIMULATED: nothing is copied or added in fixture mode.',
        lines: draft => [{ label: 'Action', value: draft.how === 'stream' ? 'Open Stream setup' : 'Copy the URL' }] },
    ],
    seal: async draft => {
      if (draft.how === 'stream') {
        window.location.hash = '#/stream';
        return { say: mode === 'core' ? 'Stream setup is open; the Duel row is there with its size and hold to add.'
          : 'Stream setup is open. In fixture mode it has no Duel row; nothing was added.' };
      }
      const door = duelHost.core();
      if (mode !== 'core' || !door) return { say: 'Fixture mode has no live duel source, so nothing was copied.',
        lines: [{ label: 'In core mode', value: 'The core resolves /tiltyard/current' }] };
      await door.copySource();
      const outcome = door.outcome();
      if (outcome.error) throw new Error(outcome.error);
      return { say: outcome.notice ?? 'Duel browser-source URL copied. Add it in OBS.' };
    },
  });
}

/** When the demo's champion is crowned, the Steward names what was shown and offers the real flows. */
let watching: (() => void) | undefined;
function closeDemoWhenCrowned() {
  watching?.();
  let started = false;
  const check = () => {
    const picture = duelHost.picture();
    if (!picture?.demo) { if (started) { watching?.(); watching = undefined; } return; }
    started = true;
    if (picture.phase !== 'done' || !picture.champion) return;
    watching?.(); watching = undefined;
    // Leave the champion on the stage a moment, then the room shows the core again.
    if (duelSandbox.active()) setTimeout(() => { duelSandbox.set(false); }, 4000);
    stewardDock.say({ chamber: 'studio', who: 'steward', simulated: true, sealed: true,
      text: `Champion: ${picture.champion.title}. What you saw: chat settled the question in ${picture.matches} matches, one vote per viewer, and lines the Gatehouse barred never counted. Next: start a duel with your own question, or put it on stream.${duelSandbox.active() ? ' Your core was never touched; the stage shows it again in a moment.' : ''}`,
      chips: [{ label: 'Start a duel', action: { kind: 'flow', chamber: 'studio', flow: 'studio-duel' } },
        { label: 'Show the duel on stream', action: { kind: 'flow', chamber: 'studio', flow: 'studio-duel-stream' } }] });
  };
  watching = duelHost.subscribe(check);
}

function buildDemo(mode: Mode): StewardFlow<DuelDraft> {
  return defineFlow<DuelDraft>({
    id: 'studio-demo', chamber: 'studio', title: 'Play demo · a chat duel', simulated: true,
    intents: ['demo', 'show me', 'play demo'],
    intro: 'Let chat settle a question: two options at a time, viewers type 1 or 2, and the winner moves on until one is champion. Four sample options at three times speed; every ballot is SIMULATED.',
    initial: () => demoDraft,
    steps: [
      { id: 'plan', kind: 'preview', label: 'Demo', continue_label: 'Go on',
        prompt: 'Above is the first match, marked DRAFT. Once you start it: ballots arrive and the tally moves, the window closes, the verdict lands, and the next match opens until a champion is crowned.',
        lines: draft => [{ label: 'Question', value: draft.prompt ?? draft.title },
          { label: 'Contestants', value: `${draft.entries.length} · ${shape(draft.entries.length)}` },
          { label: 'Ballots', value: 'SIMULATED · generated on this machine' },
          { label: 'Length', value: 'About thirty seconds' }] },
      { id: 'seal', kind: 'confirm', label: 'Play', prompt: 'Hold to start the demo, then just watch the stage.',
        note: 'Demo sandbox · SIMULATED · nothing touches your core. Generated ballots on this machine; nothing reaches chat or OBS.',
        lines: draft => [{ label: 'Contestants', value: draft.entries.map(entry => entry.title).join(' · ') }] },
    ],
    seal: async draft => {
      await startDuel(draft, mode);
      // Lower the sheet so the stage is the picture again; the receipt stays in the dock line.
      stewardDock.collapse();
      closeDemoWhenCrowned();
      return { say: `Demo running: ${firstPair(draft)} first. Watch the tally; Enter on the stage skips a wait.`,
        lines: [{ label: 'Demo', value: 'SIMULATED · four sample contestants' }] };
    },
  });
}

const built = new Map<Mode, { start: StewardFlow<DuelDraft>; stream: StewardFlow<StreamDraft>; demo: StewardFlow<DuelDraft> }>();
function flowsFor(mode: Mode) {
  let flows = built.get(mode);
  if (!flows) { flows = { start: buildStartFlow(mode), stream: buildStreamFlow(mode), demo: buildDemo(mode) }; built.set(mode, flows); }
  return flows;
}
/** The "Start a duel" flow for an empty stage's button. */
export const startDuelFlow = (mode: Mode) => flowsFor(mode).start;
export const streamDuelFlow = (mode: Mode) => flowsFor(mode).stream;
/** Flows whose draft is a duel the stage can show. */
export const duelDraftFlows: readonly string[] = ['studio-duel', 'studio-demo'];

export function studioSteward(snapshot: Snapshot): ChamberSteward {
  const mode: Mode = snapshot.mode === 'fixture' ? 'fixture' : 'core';
  const flows = flowsFor(mode);
  return {
    ...roomSteward('studio', snapshot, ['duel', 'tournament', 'bracket', 'map room', 'sand table', 'tiltyard']),
    greeting: 'The Map Room: chat duels, where chat votes between two options until one wins. Start one, put it on stream, or play the demo; nothing acts until you hold to seal.',
    flows: [flows.start, flows.stream], demo: flows.demo,
    catch_up: () => {
      const picture = duelHost.picture();
      return { say: picture ? pictureLine(picture) : 'The duel stage is not open yet.',
        ...(picture ? { lines: [{ label: 'List', value: picture.title }, { label: 'Ballots',
          value: picture.source === 'core' ? picture.simulated ? 'SIMULATED, counted by the core' : 'Counted by the core' : 'SIMULATED · generated' }] } : {}),
        ...(mode === 'fixture' || picture?.simulated ? { simulated: true } : {}) };
    },
  };
}
