import { defineFlow } from '@castle-control/ui/steward-flow';
import type { ChamberSteward, FlowOption } from '@castle-control/ui/steward-flow';
import type { RehearsalScenarioParams } from '@castle-control/contract';
import { fixtureVisuals } from '../beacons-fixture.js';
import type { Snapshot } from '../model.js';
import { streamPresets } from '../stream/presets.js';
import { activeRehearsal } from './rehearsal-bridge.js';
import type { RehearsalBridge } from './rehearsal-bridge.js';
import { rehearsalCopy as copy } from './rehearsal-copy.js';
import type { RehearsalPreset, RehearsalState } from './rehearsal-model.js';

/**
 * Dress rehearsal setup as Steward flows. Each flow builds a draft one decision at a
 * time; only the confirm card's hold calls the page's rehearsal model through the bridge.
 * Without the desktop app (fixture dev) every flow still walks, and its seal says plainly
 * that nothing was sent.
 */
const desktopOnly = 'Dress rehearsal needs the desktop app, so nothing was sent to OBS or the core.';
const live = (): { bridge: RehearsalBridge; state: RehearsalState } | undefined => {
  const bridge = activeRehearsal();
  const state = bridge?.model.getSnapshot();
  return bridge && state?.phase === 'inside' ? { bridge, state } : undefined;
};
const settle = async (bridge: RehearsalBridge) => {
  for (let tries = 0; tries < 200 && bridge.model.getSnapshot().busy; tries++) await new Promise(resolve => setTimeout(resolve, 25));
  return bridge.model.getSnapshot();
};

// ---------------------------------------------------------------- Connect my OBS
export type ConnectDraft = { where?: 'local' | 'other'; host?: string; port_mode?: 'default' | 'other'; port?: number;
  secret?: 'yes' | 'no'; remember?: boolean };
export const connectAddress = (draft: ConnectDraft) => `${draft.host ?? '127.0.0.1'}:${draft.port ?? 4455}`;

export const connectFlow = defineFlow<ConnectDraft>({
  id: 'rehearsal-connect', chamber: 'rehearsal', title: 'Connect my OBS', chip: 'Connect my OBS',
  intents: ['connect my obs', 'connect obs', 'websocket', 'obs password', 'link obs'],
  intro: 'Let us reach your OBS. A few small choices; the password itself never enters this conversation.',
  initial: () => ({}),
  steps: [
    { id: 'where', kind: 'preset', label: 'OBS', prompt: 'Where does OBS run?',
      presets: () => [
        { id: 'local', label: 'On this computer', consequence: 'Address 127.0.0.1, the usual case.' },
        { id: 'other', label: 'On another computer', consequence: 'You type its address next.' },
      ],
      apply: (draft, id) => id === 'local' ? { ...draft, where: 'local', host: '127.0.0.1' } : { ...draft, where: 'other' } },
    { id: 'host', kind: 'field', label: 'Address', prompt: 'What is that computer\'s address on your network?',
      when: draft => draft.where === 'other', placeholder: '192.168.1.20', hint: 'A host name or IP address, no spaces.',
      validate: raw => /^[A-Za-z0-9.:[\]-]{1,253}$/.test(raw.trim()) ? null : 'Type a host name or IP address, without spaces.',
      apply: (draft, raw) => ({ ...draft, host: raw.trim() }) },
    { id: 'port', kind: 'choice', label: 'Port', prompt: 'Which WebSocket port does OBS listen on?',
      options: () => [
        { id: 'default', label: '4455', consequence: 'The OBS default. Leave it unless you changed it.' },
        { id: 'other', label: 'A different port', consequence: 'You type it next.' },
      ],
      apply: (draft, id) => id === 'default' ? { ...draft, port_mode: 'default', port: 4455 } : { ...draft, port_mode: 'other' } },
    { id: 'port_number', kind: 'field', label: 'Port number', input: 'number', prompt: 'Type the port from OBS\'s WebSocket settings.',
      when: draft => draft.port_mode === 'other', placeholder: '4455',
      validate: raw => /^\d{1,5}$/.test(raw.trim()) && Number(raw) >= 1 && Number(raw) <= 65535 ? null : 'A whole number from 1 to 65535.',
      apply: (draft, raw) => ({ ...draft, port: Number(raw.trim()) }) },
    { id: 'secret', kind: 'choice', label: 'Password', prompt: 'Does OBS ask for a password? You will type it on the page, never here.',
      options: () => [
        { id: 'yes', label: 'OBS asks for a password', consequence: 'Type it in the masked field on the page. It is read once at the seal, then cleared.' },
        { id: 'no', label: 'No password', consequence: 'Authentication is switched off in OBS\'s WebSocket settings.' },
      ],
      summary: (_draft, id) => id === 'yes' ? 'typed on the page' : 'none',
      apply: (draft, id) => ({ ...draft, secret: id === 'yes' ? 'yes' : 'no' }) },
    { id: 'remember', kind: 'choice', label: 'Remember', prompt: 'Should the core remember this connection?',
      options: () => [
        { id: 'once', label: 'Just this time', consequence: 'Nothing is kept. You connect again next session.' },
        { id: 'remember', label: 'Remember on this computer', consequence: 'Kept by the core on this computer, and only once OBS accepts it.' },
      ],
      apply: (draft, id) => ({ ...draft, remember: id === 'remember' }) },
    { id: 'seal', kind: 'confirm', label: 'Connect', prompt: 'Hold to connect.',
      note: 'The hold reads the masked field once, clears it and asks OBS to connect. Nothing is added to a scene.',
      lines: draft => [
        { label: 'Address', value: connectAddress(draft) },
        { label: 'Password', value: draft.secret === 'yes' ? 'Typed on the page · masked' : 'None' },
        { label: 'Remember', value: draft.remember ? 'On this computer' : 'Just this time' },
      ] },
  ],
  seal: async draft => {
    const reach = live();
    if (!reach) return { say: desktopOnly };
    const { bridge } = reach;
    if (draft.secret === 'yes' && !bridge.hasPassword()) {
      bridge.notify('Type the OBS password in the masked field, then hold again.');
      throw new Error('Missing password');
    }
    const sent = await bridge.connect({ host: draft.host ?? '127.0.0.1', port: draft.port ?? 4455, remember: draft.remember === true });
    if (!sent) return { say: 'The connection form is not on the page, so nothing was sent.' };
    const after = await settle(bridge);
    return after.obs === 'connected'
      ? { say: `OBS is connected at ${connectAddress(draft)}.`, lines: [{ label: 'Next', value: 'Set up the rehearsal scene' }] }
      : { say: `OBS did not connect: ${after.connection_notice || 'no answer from OBS'}. Check its WebSocket settings and try again.` };
  },
});

// ------------------------------------------------------ Set up the rehearsal scene
type Pick = 'all' | 'vote' | 'beacons' | 'duel' | 'lot';
export type SceneDraft = { scene?: 'ensure' | 'ready'; pick?: Pick; preset?: RehearsalPreset };
const pickLabel: Record<Pick, string> = { all: 'Everything available', vote: 'Gatehouse vote bar', beacons: 'Beacon visuals', duel: 'Duel', lot: 'Lot plate' };
const kindOf: Record<Exclude<Pick, 'all'>, string> = { vote: 'vote', beacons: 'beacon', duel: 'duel', lot: 'lot' };

/** The output rows a pick adds. Rows that are not idle (unavailable, already added) are left out. */
export function pickedRows(state: RehearsalState | undefined, pick: Pick | undefined) {
  const rows = state?.rows ?? [];
  const usable = rows.filter(row => row.phase === 'idle');
  return pick === 'all' ? usable : usable.filter(row => pick && row.kind === kindOf[pick]);
}
const presetLine: Record<RehearsalPreset, string> = {
  '1080p': 'Landscape, the usual stream canvas.', '720p': 'Landscape, a lighter canvas.', vertical: 'Portrait, for a vertical stream.',
};

export const sceneFlow = defineFlow<SceneDraft>({
  id: 'rehearsal-scene', chamber: 'rehearsal', title: 'Set up the rehearsal scene', chip: 'Set up the scene',
  intents: ['scene', 'add source', 'sources', 'browser source', 'set up scene'],
  intro: 'One scene of its own, the sources you want in it, one size. Nothing reaches OBS until you hold.',
  initial: () => ({}),
  steps: [
    { id: 'scene', kind: 'choice', label: 'Scene', prompt: `First the scene: ${copy.scene_name}.`,
      options: () => live()?.state.scene_ready
        ? [{ id: 'ready', label: 'Use the rehearsal scene', consequence: 'It is ready in OBS already.' }]
        : [{ id: 'ensure', label: 'Make sure it exists', consequence: 'Creates it in OBS if it is missing. Your other scenes stay as they are.' }],
      apply: (draft, id) => ({ ...draft, scene: id === 'ready' ? 'ready' : 'ensure' }) },
    { id: 'pick', kind: 'preset', label: 'Sources', prompt: 'Which sources go into it?',
      presets: () => {
        const state = live()?.state;
        const count = (pick: Pick) => state ? pickedRows(state, pick).length : undefined;
        const line = (pick: Pick, text: string) => count(pick) === 0 ? 'Not available yet, or already added.' : text;
        const lot = state?.rows.find(row => row.kind === 'lot');
        return [
          { id: 'all', label: pickLabel.all, consequence: line('all', 'Vote bar, beacons and duel. The Lot plate joins once a Lot is filled.') },
          { id: 'vote', label: pickLabel.vote, consequence: line('vote', 'The aggregate-only vote bar. No names, no messages.') },
          { id: 'beacons', label: pickLabel.beacons, consequence: line('beacons', 'Every beacon visual you have made.') },
          { id: 'duel', label: pickLabel.duel, consequence: line('duel', 'The Tiltyard duel stage.') },
          { id: 'lot', label: pickLabel.lot, consequence: lot && lot.phase === 'idle' ? 'The SIMULATED plate of the filled Lot.' : copy.fill_first },
        ] satisfies FlowOption[];
      },
      apply: (draft, id) => ({ ...draft, pick: id as Pick }) },
    { id: 'preset', kind: 'choice', label: 'Size', prompt: 'And what size should each source be?',
      options: () => (Object.keys(streamPresets) as RehearsalPreset[]).map(preset => ({ id: preset,
        label: `${preset} · ${streamPresets[preset].width} × ${streamPresets[preset].height}`, consequence: presetLine[preset] })),
      summary: (_draft, id) => id,
      apply: (draft, id) => Object.hasOwn(streamPresets, id) ? { ...draft, preset: id as RehearsalPreset } : draft },
    { id: 'seal', kind: 'confirm', label: 'Add', prompt: 'Hold to add them to the rehearsal scene.',
      note: 'Adds transparent browser sources to the rehearsal scene only. Inspect their placement in OBS afterwards.',
      lines: draft => {
        const state = live()?.state;
        const rows = pickedRows(state, draft.pick);
        return [
          { label: 'Scene', value: `${copy.scene_name}${draft.scene === 'ensure' ? ' · created if missing' : ''}` },
          { label: 'Sources', value: state ? rows.map(row => row.name).join(', ') || 'None available' : pickLabel[draft.pick ?? 'all'] },
          { label: 'Size', value: draft.preset ? `${streamPresets[draft.preset].width} × ${streamPresets[draft.preset].height}` : '1920 × 1080' },
        ];
      } },
  ],
  seal: async draft => {
    const reach = live();
    if (!reach) return { say: desktopOnly };
    const { bridge } = reach;
    if (reach.state.obs !== 'connected') return { say: 'OBS is not connected, so nothing was added. Connect my OBS first.' };
    if (draft.scene === 'ensure' || !reach.state.scene_ready) await bridge.model.ensureScene();
    let state = await settle(bridge);
    if (!state.scene_ready) return { say: `The rehearsal scene is not ready: ${state.scene_notice || 'OBS did not confirm it'}.` };
    const rows = pickedRows(state, draft.pick);
    for (const row of rows) {
      bridge.model.setPreset(row.id, draft.preset ?? '1080p');
      await bridge.model.add(row.id);
      state = await settle(bridge);
    }
    const added = state.rows.filter(row => rows.some(item => item.id === row.id) && row.phase === 'added');
    return added.length
      ? { say: `Added ${added.length} source${added.length === 1 ? '' : 's'} to ${copy.scene_name}. Inspect their placement in OBS.`,
        lines: added.map(row => ({ label: row.name, value: 'Added to the scene' })) }
      : { say: rows.length ? `Nothing was added: ${state.scene_notice || 'OBS refused the sources'}.` : 'Nothing was available to add.' };
  },
});

// ------------------------------------------------------------- Run a scenario
type Scenario = RehearsalScenarioParams['scenario'] | 'crowd';
export type ScenarioDraft = { scenario?: Scenario; visual_id?: string; crowd?: number };
const scenarioLabel: Record<Scenario, string> = {
  lots_fill: copy.lot, vote_round: copy.vote, beacon_fire: 'Fire a beacon', duel_round: copy.duel, crowd: 'Set the crowd level',
};
const crowdPresets = [
  { id: '0', label: 'Silent', consequence: 'No SIMULATED chat at all.' },
  { id: '30', label: 'A quiet room · 30', consequence: 'Thirty SIMULATED messages a minute.' },
  { id: '120', label: 'A lively evening · 120', consequence: 'Busy enough to test the Gatehouse.' },
  { id: '400', label: 'A raid · 400', consequence: 'A flood. Watch what the moat holds.' },
] as const;
const visualsFor = () => {
  const state = live()?.state;
  return state ? state.visuals.map(visual => ({ id: visual.visual_id, name: visual.name }))
    : fixtureVisuals.map(visual => ({ id: visual.visual_id, name: visual.name }));
};

export const scenarioFlow = defineFlow<ScenarioDraft>({
  id: 'rehearsal-scenario', chamber: 'rehearsal', title: 'Run a scenario', chip: 'Run a scenario', simulated: true,
  intents: ['scenario', 'fill a lot', 'run a vote', 'fire a beacon', 'duel round', 'crowd', 'busy chat', 'test'],
  intro: 'Every scenario is generated and SIMULATED. Pick one; it runs on your hold.',
  initial: () => ({}),
  steps: [
    { id: 'scenario', kind: 'choice', label: 'Scenario', prompt: 'What should the rehearsal play?',
      options: () => [
        { id: 'lots_fill', label: scenarioLabel.lots_fill, consequence: 'SIMULATED entrants join a rehearsal draw.', simulated: true },
        { id: 'vote_round', label: scenarioLabel.vote_round, consequence: 'A SIMULATED crowd votes on the Gatehouse bar.', simulated: true },
        ...(visualsFor().length ? [{ id: 'beacon_fire', label: scenarioLabel.beacon_fire, consequence: 'SIMULATED contributions light one beacon.', simulated: true }] : []),
        { id: 'duel_round', label: scenarioLabel.duel_round, consequence: 'One SIMULATED Tiltyard round.', simulated: true },
        { id: 'crowd', label: scenarioLabel.crowd, consequence: 'How busy SIMULATED chat is, per minute.', simulated: true },
      ],
      apply: (draft, id) => Object.hasOwn(scenarioLabel, id) ? { scenario: id as Scenario } : draft },
    { id: 'visual', kind: 'choice', label: 'Beacon', prompt: 'Which beacon?', when: draft => draft.scenario === 'beacon_fire',
      options: () => visualsFor().map(visual => ({ id: visual.id, label: visual.name })),
      apply: (draft, id) => ({ ...draft, visual_id: id }) },
    { id: 'crowd', kind: 'preset', label: 'Crowd', prompt: 'How busy should chat be?', when: draft => draft.scenario === 'crowd',
      presets: () => crowdPresets,
      apply: (draft, id) => ({ ...draft, crowd: Number(id) }) },
    { id: 'seal', kind: 'confirm', label: 'Run', prompt: 'Hold to run it.',
      note: 'Generated SIMULATED data only. No real viewer, no Twitch login.',
      lines: draft => [
        { label: 'Scenario', value: scenarioLabel[draft.scenario ?? 'lots_fill'] },
        ...(draft.scenario === 'beacon_fire' ? [{ label: 'Beacon', value: visualsFor().find(item => item.id === draft.visual_id)?.name ?? 'Not chosen' }] : []),
        ...(draft.scenario === 'crowd' ? [{ label: 'Crowd', value: `${draft.crowd ?? 0} per minute` }] : []),
      ] },
  ],
  seal: async draft => {
    const reach = live();
    if (!reach) return { say: desktopOnly };
    const { bridge } = reach;
    if (!reach.state.status?.active) return { say: copy.inactive };
    if (draft.scenario === 'crowd') {
      const accepted = bridge.model.setCrowd(draft.crowd ?? 0);
      return { say: accepted ? `SIMULATED chat set to ${draft.crowd ?? 0} a minute.` : 'The crowd level was not accepted.' };
    }
    if (draft.scenario === 'beacon_fire' && draft.visual_id) bridge.model.setVisual(draft.visual_id);
    await bridge.model.scenario(draft.scenario ?? 'lots_fill');
    const after = await settle(bridge);
    return { say: after.scenario_notice || copy.accepted };
  },
});

// ---------------------------------------------------------------- Clean up
export type CleanupDraft = { leave?: boolean };
export const cleanupFlow = defineFlow<CleanupDraft>({
  id: 'rehearsal-cleanup', chamber: 'rehearsal', title: 'Clean up',
  intents: ['clean up', 'cleanup', 'remove', 'tidy', 'remove sources'],
  intro: 'Tidy OBS after the rehearsal. Only what this rehearsal added is removed.',
  initial: () => ({}),
  steps: [
    { id: 'what', kind: 'choice', label: 'Clean up', prompt: 'How far should I tidy?',
      options: () => [
        { id: 'sources', label: copy.clear, consequence: 'Sources this rehearsal added. Your other OBS inputs stay in place.' },
        { id: 'leave', label: 'Remove them and leave the rehearsal', consequence: 'Then the desktop app reopens in your normal workspace.' },
      ],
      apply: (_draft, id) => ({ leave: id === 'leave' }) },
    { id: 'seal', kind: 'confirm', label: 'Remove', prompt: 'Hold to remove the rehearsal sources.',
      note: copy.clear_help,
      lines: draft => [{ label: 'Removes', value: 'Rehearsal sources only' }, { label: 'Then', value: draft.leave ? 'Leave dress rehearsal' : 'Stay in the rehearsal' }] },
  ],
  seal: async draft => {
    const reach = live();
    if (!reach) return { say: desktopOnly };
    const { bridge } = reach;
    if (reach.state.obs !== 'connected') return { say: 'OBS is not connected, so nothing was removed.' };
    await bridge.model.clear();
    const after = await settle(bridge);
    if (draft.leave) await bridge.model.switchMode();
    return { say: after.scene_notice || 'Rehearsal sources removed.' };
  },
});

export const rehearsalFlows = [connectFlow, sceneFlow, scenarioFlow, cleanupFlow] as const;

/** Steward flows for the Dress rehearsal (#/rehearsal). */
export function rehearsalSteward(snapshot: Snapshot): ChamberSteward {
  const fixture = snapshot.mode === 'fixture';
  return {
    name: 'the Dress rehearsal', flows: rehearsalFlows, keywords: ['rehearsal', 'rehearse', 'dress rehearsal', 'dry run'],
    greeting: fixture ? 'Dress rehearsal runs in the desktop app. You can walk each step here; nothing is sent.'
      : 'Dress rehearsal: your own OBS, the real core, SIMULATED chat. Connect, set the scene, run a scenario.',
    catch_up: () => {
      const reach = live();
      if (!reach) return { say: fixture ? desktopOnly : 'Dress rehearsal is not running yet. Start it from the page.', simulated: true };
      const { state } = reach;
      const added = state.rows.filter(row => row.phase === 'added').length;
      return { say: 'Here is the rehearsal so far.', simulated: true, lines: [
        { label: 'OBS', value: copy[state.obs] },
        { label: 'Scene', value: state.scene_ready ? copy.scene_name : 'Not set up' },
        { label: 'Sources', value: `${added} of ${state.rows.length} added` },
        { label: 'Crowd', value: `${state.crowd} SIMULATED a minute` },
      ] };
    },
  };
}
