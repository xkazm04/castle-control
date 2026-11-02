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
import { roomDeck } from './steward-keys.jsx';
import type { DuelKey } from './steward-keys.jsx';
import { bracketDrawer } from '../rooms/studio/bracket-drawer.js';
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

export function roomActionKeys(chamber: FlowChamber, registry: StewardRegistry, snapshot: Snapshot, deck = roomDeck): ActionKey[] {
  if (chamber === 'keep' || chamber === 'stream' || chamber === 'rehearsal') return [];
  return deck[chamber].flatMap((item): ActionKey[] => [roomActionKey(item, chamber, registry, snapshot)].filter(key => key !== undefined));
}

/** A beacon key exists only while its beacon does: a room with fewer beacons has no dead Q/W/E. */
function roomActionKey(item: (typeof roomDeck)[ModuleId][number], chamber: ModuleId, registry: StewardRegistry, snapshot: Snapshot): ActionKey | undefined {
    if ('drawer' in item) return { key: item.key, label: item.label, run: bracketDrawer.open };
    if ('beacon' in item) {
      const fixture = snapshot.mode === 'fixture' ? fixtureBeacons() : undefined;
      const core = coreBeaconsConnection(snapshot)?.port;
      const visual = fixture?.getSnapshot().visuals[item.beacon]?.visual ?? core?.getSnapshot().visuals[item.beacon];
      if (!visual) return undefined;
      return { key: item.key, label: visual.name, run: () => {
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
