import type { ModuleId } from '@castle-control/ui';
import type { FlowChamber, StewardRegistry } from '@castle-control/ui/steward-flow';
import type { Snapshot } from '../model.js';
import type { ShellSurface } from '../navigation.js';
import { keepSteward } from '../keep/steward-flows.js';
import { lotterySteward } from '../rooms/lottery/steward-flows.js';
import { moderatorSteward } from '../rooms/moderator/steward-flows.js';
import { visualsSteward } from '../rooms/visuals/steward-flows.js';
import { studioSteward } from '../rooms/studio/steward-flows.js';
import { streamSteward } from '../stream/steward-flows.js';
import { rehearsalSteward } from '../rehearsal/steward-flows.js';
import type { ActionKey } from '@castle-control/ui/action-row';
import { findFlow, stewardDock } from '@castle-control/ui/steward-flow';
import { proposalQueue } from '@castle-control/ui/steward';
import { moderationSession, proposeCommand } from '../rooms/moderator/session.js';
import { duelHost, duelSandbox, runCore } from '../rooms/studio/duel-host.js';
import { coreBeaconsConnection } from '../client.js';
import { fixtureBeacons } from '../rooms/visuals/stage-state.js';

/** The one table of chamber Stewards. Each module owns its own steward-flows.ts. */
export function stewardRegistry(snapshot: Snapshot): StewardRegistry {
  return {
    keep: keepSteward(snapshot),
    lottery: lotterySteward(snapshot),
    moderator: moderatorSteward(snapshot),
    visuals: visualsSteward(snapshot),
    studio: studioSteward(snapshot),
    stream: streamSteward(snapshot),
    rehearsal: rehearsalSteward(snapshot),
  };
}

/** The overview and the demo talk to the Keep's Steward. */
export function flowChamber(current: ModuleId | ShellSurface): FlowChamber {
  return current === 'overview' || current === 'demo' ? 'keep' : current;
}

type DuelKey = 'enter' | 'undo' | 'speed' | 'reset';
type RoomAction = { key: string; label: string } & ({ flow: string } | { command: 'release' | 'remove' | 'ban' | 'dismiss' | 'shield' } | { duel: DuelKey } | { beacon: number });
/** Winner letters; room-private controls resume their matching guarded flow. */
export const roomDeck: Readonly<Record<ModuleId, readonly RoomAction[]>> = {
  lottery: [
    { key: 'Q', label: 'set up a draw', flow: 'lots-setup' },
    { key: 'W', label: 'cast the lots', flow: 'lots-cast' },
    { key: 'E', label: 'prove it · writ', flow: 'lots-prove' },
    { key: 'R', label: 'reveal next · cast setup', flow: 'lots-cast' },
    { key: 'G', label: 'reveal by hand · cast setup', flow: 'lots-cast' },
    { key: 'H', label: 'ceremony sound · cast setup', flow: 'lots-cast' },
    { key: 'T', label: 'tools · draw setup', flow: 'lots-setup' },
    { key: 'I', label: 'about the writ', flow: 'lots-prove' },
    { key: 'A', label: 'winners · draw setup', flow: 'lots-setup' },
    { key: 'S', label: 'entry pool · draw setup', flow: 'lots-setup' },
    { key: 'D', label: 'raider cap · draw setup', flow: 'lots-setup' },
    { key: 'F', label: 'ceremony · draw setup', flow: 'lots-setup' },
  ],
  moderator: [
    { key: 'Q', label: 'propose pass', command: 'release' },
    { key: 'W', label: 'propose bar', command: 'remove' },
    { key: 'E', label: 'propose ban', command: 'ban' },
    { key: 'R', label: 'propose dismiss', command: 'dismiss' },
    { key: 'T', label: 'raise / lower the drawbridge', command: 'shield' },
    { key: 'A', label: 'show the vote bar', flow: 'gatehouse-votebar' },
    { key: 'G', label: 'set the rules', flow: 'gatehouse-rules' },
    { key: 'D', label: 'restyle · vote bar', flow: 'gatehouse-votebar' },
    { key: 'F', label: 'custom look · vote bar', flow: 'gatehouse-votebar' },
    { key: 'S', label: 'Herald filter · vote bar', flow: 'gatehouse-votebar' },
  ],
  visuals: [
    { key: 'A', label: 'tune a beacon', flow: 'visuals-tune' },
    { key: 'Q', label: 'beacon 1', beacon: 0 },
    { key: 'W', label: 'beacon 2', beacon: 1 },
    { key: 'E', label: 'beacon 3', beacon: 2 },
    { key: 'S', label: 'test fire', flow: 'visuals-test-fire' },
    { key: 'D', label: 'replay a night', flow: 'visuals-replay' },
    { key: 'F', label: 'decay · tuning', flow: 'visuals-tune' },
  ],
  studio: [
    { key: 'Enter', label: 'open / advance the vote', duel: 'enter' },
    { key: 'Backspace', label: 'undo last call', duel: 'undo' },
    { key: 'Q', label: 'show the duel on stream', flow: 'studio-duel-stream' },
    { key: 'W', label: 'speed ×3', duel: 'speed' },
    { key: 'E', label: 'new bracket', duel: 'reset' },
    { key: 'T', label: 'reseed · duel setup', flow: 'studio-duel' },
    { key: 'Y', label: 'rename · duel setup', flow: 'studio-duel' },
  ],
};

export function roomActionKeys(chamber: FlowChamber, registry: StewardRegistry, snapshot: Snapshot): ActionKey[] {
  if (chamber === 'keep' || chamber === 'stream' || chamber === 'rehearsal') return [];
  return roomDeck[chamber].map(item => {
    if ('beacon' in item) {
      const fixture = snapshot.mode === 'fixture' ? fixtureBeacons() : undefined;
      const core = coreBeaconsConnection(snapshot)?.port;
      const visual = fixture?.getSnapshot().visuals[item.beacon]?.visual ?? core?.getSnapshot().visuals[item.beacon];
      return { key: item.key, label: visual?.name ?? item.label, run: () => {
        const chosen = fixture?.getSnapshot().visuals[item.beacon]?.visual ?? core?.getSnapshot().visuals[item.beacon];
        if (chosen) (fixture ?? core)?.select(chosen.visual_id);
      } };
    }
    if ('duel' in item) return { key: item.key, label: item.label, run: () => {
      const draft = stewardDock.getSnapshot().drafts.studio;
      if (draft?.flow === 'studio-duel' || draft?.flow === 'studio-demo') { stewardDock.expand(); return; }
      const picture = duelHost.picture();
      if (!picture || picture.phase === 'empty') {
        const flow = findFlow(registry, 'studio', 'studio-duel');
        if (flow) stewardDock.open(flow);
        return;
      }
      void runDuelKey(item.duel, snapshot);
    } };
    if ('flow' in item) {
      const flow = findFlow(registry, chamber, item.flow);
      return { key: item.key, label: item.label, disabled: !flow, run: () => { if (flow) stewardDock.open(flow); } };
    }
    return { key: item.key, label: item.label, disabled: snapshot.mode !== 'fixture', run: () => {
      if (snapshot.mode !== 'fixture') return;
      if (item.command === 'shield') { proposeCommand(proposalQueue, { kind: 'shield' }, 'Change the drawbridge'); return; }
      const state = moderationSession(proposalQueue).port.getSnapshot();
      const target = (item.command === 'release' || item.command === 'remove' ? state.held : state.bans)[0];
      if (target) proposeCommand(proposalQueue, { kind: item.command, decision_id: target.decision_id }, item.label);
      else stewardDock.say({ chamber, who: 'steward', simulated: true, text: 'No original line is waiting for that verdict. Nothing changed.' });
    } };
  });
}

/** Same operations as the duel's existing stage controls, including its sandbox. */
async function runDuelKey(kind: DuelKey, snapshot: Snapshot) {
  try {
    if (snapshot.mode === 'fixture' || duelSandbox.active()) {
      const { fixtureDuel } = await import('../rooms/studio/duel-fixture.js');
      fixtureDuel.send({ kind });
    } else await runCore({ kind });
  } catch (cause) {
    stewardDock.say({ chamber: 'studio', who: 'steward',
      text: cause instanceof Error ? cause.message : 'The duel action could not finish. Review the stage before trying again.',
      ...(snapshot.mode === 'fixture' ? { simulated: true } : { live: true }) });
    stewardDock.expand();
  }
}
