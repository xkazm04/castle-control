import { createElement } from 'react';
import type { Visual } from '@castle-control/contract';
import { proposalQueue } from '@castle-control/ui/steward';
import { defineFlow } from '@castle-control/ui/steward-flow';
import type { ChamberSteward, FlowLine, FlowOption } from '@castle-control/ui/steward-flow';
import { coreBeaconsConnection } from '../../client.js';
import type { PreviewVisual } from '../../beacons-model.js';
import { curveIntensity } from '../../beacons-model.js';
import { sampleNight } from '../../beacons-nights.js';
import type { NightId } from '../../beacons-nights.js';
import type { Snapshot } from '../../model.js';
import { roomSteward } from '../../shell/steward-room.js';
import { source_labels } from './contribution-input.js';
import { curveConsequence, curveSteps, decayLabel, decays, demoCases, feeds, fittedCurve, nightName, nightPhrase, nights,
  nightTrace, replayMoves, shotResult, shots, strengthLabel, strengths, tunedVisual } from './flow-model.js';
import type { DemoDraft, ReplayDraft, TestDraft, TuneDraft } from './flow-model.js';
import { proposeCurve } from './replay-proposal.js';
import { fixtureBeacons } from './stage-state.js';
import { flow_ids } from './stage-view.js';
import { NightNarration } from './narration.jsx';

/**
 * The Beacons' Steward: four small flows over the room's own preview model. Each step only
 * drafts (the picture above shows it); the hold to seal is the one place anything changes.
 * Fixture mode changes the local SIMULATED preview; core mode calls the existing core port.
 */
type Access = {
  core: boolean;
  items(): readonly PreviewVisual[];
  selected(): string | undefined;
  tune(visual: Visual, replay: string): Promise<void>;
  fire(visual_id: string, shot: (typeof shots)[number]): Promise<void>;
};

function fixtureAccess(): Access {
  const port = () => fixtureBeacons();
  return {
    core: false,
    items: () => port().getSnapshot().visuals,
    selected: () => port().getSnapshot().selected,
    async tune(visual, replay) {
      const beacons = port();
      beacons.select(visual.visual_id);
      if (visual.input) beacons.input(visual.input.source);
      beacons.curve(visual.curve);
      const tuned = beacons.getSnapshot().visuals.find(item => item.visual.visual_id === visual.visual_id)?.visual;
      if (!tuned || JSON.stringify(tuned.curve) !== JSON.stringify(visual.curve)) throw new Error('The preview refused the curve.');
      // The same proposal record the workbench uses, sealed by this hold: "last sealed curve" stays true everywhere.
      const proposal = proposeCurve(tuned, replay, proposalQueue);
      if (!proposal.ok || !proposalQueue.seal(proposal.proposal.id).ok) throw new Error('The seal was refused.');
    },
    async fire(visual_id, shot) {
      const beacons = port();
      const found = beacons.getSnapshot().visuals.find(item => item.visual.visual_id === visual_id);
      if (!found) throw new Error('No such beacon.');
      beacons.select(found.visual.visual_id);
      if (shot.source) beacons.fire(shot.source, shot.count); else beacons.advance();
    },
  };
}

function coreAccess(snapshot: Snapshot): Access {
  const port = () => coreBeaconsConnection(snapshot)?.port;
  return {
    core: true,
    items: () => (port()?.getSnapshot().visuals ?? []).map(visual => ({ visual, gift_weight: 1, total: 0, intensity: 0 })),
    selected: () => port()?.getSnapshot().selected,
    async tune(visual) {
      const beacons = port();
      if (!beacons) throw new Error('Beacons core is not connected.');
      await beacons.upsert({ visual });
      if (beacons.getSnapshot().phase === 'error') throw new Error('The core refused the visual.');
    },
    async fire(visual_id, shot) {
      const beacons = port();
      if (!beacons || !shot.source) throw new Error('Nothing to fire.');
      await beacons.simulate({ visual_id: visual_id as Visual['visual_id'], burst: { source: shot.source, amount: shot.count } });
      if (beacons.getSnapshot().phase === 'error') throw new Error('The core refused the test fire.');
    },
  };
}

export function beaconsAccess(snapshot: Snapshot): Access {
  return snapshot.mode === 'fixture' ? fixtureAccess() : coreAccess(snapshot);
}

const startOn = (access: Access): { visual?: string } => { const id = access.selected(); return id ? { visual: id } : {}; };
const percent = (value: number) => `${Math.round(value * 100)}%`;
const findItem = (access: Access, id: string | undefined) => access.items().find(item => item.visual.visual_id === id);
function visualOptions(access: Access): FlowOption[] {
  const selected = access.selected();
  return access.items().map(item => ({ id: item.visual.visual_id, label: item.visual.name,
    ...(item.visual.visual_id === selected ? { tag: 'on screen' } : {}),
    consequence: `${item.visual.input ? `Fed by ${source_labels[item.visual.input.source]}` : 'Not routed'}${access.core ? '' : ` · ${percent(item.intensity)} blaze now`}` }));
}
const visualStep = <D extends { visual?: string }>(access: Access, prompt: string) => ({
  id: 'visual', kind: 'choice' as const, label: 'Beacon', prompt,
  options: () => visualOptions(access),
  apply: (draft: D, id: string): D => ({ ...draft, visual: id }),
});
const nameOf = (access: Access, id: string | undefined) => findItem(access, id)?.visual.name ?? 'Not chosen';
const scope = (access: Access) => access.core
  ? 'Saved to the core configuration on your hold. Money changes looks only.'
  : 'SIMULATED · changes this preview room only. Nothing reaches OBS or chat.';

function tuneFlow(access: Access) {
  const tuned = (draft: TuneDraft) => {
    const item = findItem(access, draft.visual);
    return item ? tunedVisual(item.visual, draft) : undefined;
  };
  return defineFlow<TuneDraft>({
    id: flow_ids.tune, chamber: 'visuals', title: 'Tune a beacon', chip: 'Tune a beacon', simulated: !access.core,
    intents: ['tune', 'tune a beacon', 'curve', 'decay', 'how strongly', 'feeds', 'kindling'],
    intro: 'Let us tune a beacon. Four small choices, then you see it against a sample night. Nothing changes until you hold to seal.',
    initial: () => startOn(access),
    steps: [
      visualStep<TuneDraft>(access, 'Which beacon? The picture above switches to it.'),
      { id: 'feed', kind: 'choice', label: 'Fed by', prompt: 'What should feed it?',
        options: draft => feeds.map(feed => ({ id: feed.id, label: feed.label,
          ...(findItem(access, draft.visual)?.visual.input?.source === feed.id ? { tag: 'now' } : {}),
          consequence: feed.counted ? 'Counts in test fires and in the sample nights' : 'Saved as its route; the sample nights count gift subs and subs only' })),
        apply: (draft, id) => { const feed = feeds.find(item => item.id === id); return feed ? { ...draft, feed: feed.id } : draft; } },
      { id: 'strength', kind: 'preset', label: 'Strength', prompt: 'How strongly should it answer? Each card is measured against two generated nights.',
        presets: draft => strengths.map(id => {
          const item = findItem(access, draft.visual);
          const visual = item ? tunedVisual(item.visual, { ...draft, strength: id }) : undefined;
          return { id, label: strengthLabel(id), ...(id === 'keep' ? { tag: 'now' } : {}),
            consequence: visual ? `Full at ${visual.curve.ranges.at(-1)?.total ?? 0} · ${curveConsequence(visual.curve, item?.gift_weight)}` : '' };
        }),
        apply: (draft, id) => { const strength = strengths.find(item => item === id); return strength ? { ...draft, strength } : draft; } },
      { id: 'decay', kind: 'choice', label: 'Decay', prompt: 'And when the offerings stop, how fast should it cool?',
        options: draft => decays.map(decay => ({ id: decay.id, label: decay.label, consequence: decay.line,
          ...(JSON.stringify(findItem(access, draft.visual)?.visual.curve.decay) === JSON.stringify(decay.decay) ? { tag: 'now' } : {}) })),
        apply: (draft, id) => { const decay = decays.find(item => item.id === id); return decay ? { ...draft, decay: decay.id } : draft; } },
      { id: 'night', kind: 'preview', label: 'Sample night', continue_label: 'Looks right',
        prompt: 'Here it is against the sample night: the picture above plays it. How it would fare on each generated night:',
        lines: draft => {
          const visual = tuned(draft);
          return visual ? nights.map(night => ({ label: night.name, value: nightPhrase(nightTrace(visual.curve, night.id)) })) : [];
        } },
      { id: 'seal', kind: 'confirm', label: 'Seal', prompt: 'Hold to seal this tuning.', note: scope(access),
        lines: draft => {
          const visual = tuned(draft);
          if (!visual) return [{ label: 'Beacon', value: 'Not chosen' }];
          return [{ label: 'Beacon', value: visual.name },
            { label: 'Fed by', value: visual.input ? source_labels[visual.input.source] : 'Not routed' },
            { label: 'Curve', value: curveSteps(visual.curve) }, { label: 'Decay', value: decayLabel(visual.curve.decay) },
            { label: 'Sample night', value: nightPhrase(nightTrace(visual.curve, 'sample')) }];
        } },
    ],
    seal: async draft => {
      const visual = tuned(draft);
      if (!visual) throw new Error('No beacon chosen');
      await access.tune(visual, `Tuned with the Steward · sample night ${nightPhrase(nightTrace(visual.curve, 'sample'))}`);
      return { say: `Sealed. The ${visual.name} now answers ${strengthLabel(draft.strength ?? 'keep').toLowerCase()} and ${decayLabel(visual.curve.decay).toLowerCase()}.`,
        lines: [{ label: 'Kept', value: access.core ? 'In the core configuration' : 'In this preview room only · SIMULATED' }] };
    },
  });
}

function testFlow(access: Access) {
  const offered = (draft: TestDraft) => {
    const route = findItem(access, draft.visual)?.visual.input?.source;
    return access.core ? shots.filter(shot => shot.source && shot.source === route) : shots;
  };
  return defineFlow<TestDraft>({
    id: flow_ids.test, chamber: 'visuals', title: 'Test fire', chip: 'Test fire', simulated: true,
    intents: ['test fire', 'test', 'fire', 'try it', 'gift bomb'],
    intro: 'A test fire: pick a sample contribution and watch the beacon react. It is simulated and never reaches a viewer.',
    initial: () => startOn(access),
    steps: [
      visualStep<TestDraft>(access, 'Which beacon should catch it?'),
      { id: 'shot', kind: 'choice', label: 'Contribution', prompt: 'Which sample contribution? The picture shows the result before you fire.',
        options: draft => {
          const item = findItem(access, draft.visual);
          const list = offered(draft);
          if (!list.length) return [{ id: 'none', label: 'Nothing routed', consequence: 'Route this beacon to gift subs or subs first' }];
          return list.map(shot => {
            if (!item || access.core) return { id: shot.id, label: shot.label, consequence: 'Sent to the core simulation on your hold' };
            const result = shotResult(item.visual.curve, item.total, item.gift_weight, shot.id);
            return { id: shot.id, label: shot.label, consequence: `${percent(result.before)} → ${percent(result.after)} blaze` };
          });
        },
        apply: (draft, id) => { const shot = shots.find(item => item.id === id); return shot ? { ...draft, shot: shot.id } : draft; } },
      { id: 'seal', kind: 'confirm', label: 'Fire', prompt: 'Hold to fire it. The picture flares when it lands.', note: 'SIMULATED test fire. Nothing reaches the stream.',
        lines: draft => {
          const item = findItem(access, draft.visual);
          const shot = shots.find(value => value.id === draft.shot);
          if (!item || !shot) return [{ label: 'Contribution', value: 'Not chosen' }];
          const result = access.core ? undefined : shotResult(item.visual.curve, item.total, item.gift_weight, shot.id);
          return [{ label: 'Beacon', value: item.visual.name }, { label: 'Contribution', value: shot.label },
            ...(result ? [{ label: 'Blaze', value: `${percent(result.before)} → ${percent(result.after)}` }] : [])];
        } },
    ],
    seal: async draft => {
      const item = findItem(access, draft.visual);
      const shot = shots.find(value => value.id === draft.shot);
      if (!item || !shot) throw new Error('Nothing to fire');
      await access.fire(item.visual.visual_id, shot);
      const after = findItem(access, item.visual.visual_id);
      return { say: `Fired ${shot.label.toLowerCase()} at the ${item.visual.name}.${after && !access.core ? ` It burns at ${percent(after.intensity)} now.` : ''}`,
        lines: [{ label: 'Reached', value: 'This preview only · nothing on stream' }] };
    },
  });
}

function nightLines(item: PreviewVisual | undefined, night: NightId | undefined, fit: boolean): FlowLine[] {
  if (!item || !night) return [];
  const curve = fit ? fittedCurve(item.visual.curve, night, item.gift_weight) : item.visual.curve;
  const trace = nightTrace(curve, night, item.gift_weight);
  return [{ label: 'Night', value: nightName(night) }, { label: 'Curve', value: curveSteps(curve) },
    { label: 'On this night', value: nightPhrase(trace) }];
}

function replayFlow(access: Access) {
  const moveOptions = (item: PreviewVisual | undefined, night: NightId | undefined): FlowOption[] => {
    if (!item || !night) return [];
    const { trace, fit } = replayMoves(item.visual.curve, night, item.gift_weight);
    return [{ id: 'keep', label: 'Keep the curve', consequence: nightPhrase(trace) },
      ...(fit ? [{ id: 'fit', label: fit.label, consequence: nightPhrase(nightTrace(fittedCurve(item.visual.curve, night, item.gift_weight), night, item.gift_weight)) }] : [])];
  };
  return defineFlow<ReplayDraft>({
    id: flow_ids.replay, chamber: 'visuals', title: 'Replay a night', chip: 'Replay a night', simulated: true,
    intents: ['replay', 'replay a night', 'night', 'sample night', 'gift wave', 'raid'],
    intro: 'We replay a generated night through a beacon, so you tune against time, not single events.',
    initial: () => startOn(access),
    steps: [
      visualStep<ReplayDraft>(access, 'Which beacon goes through the night?'),
      { id: 'night', kind: 'choice', label: 'Night', prompt: 'Which night? Each line is how this beacon fares on it.',
        options: draft => {
          const item = findItem(access, draft.visual);
          return nights.map(night => ({ id: night.id, label: night.name, consequence: item ? `${nightPhrase(nightTrace(item.visual.curve, night.id, item.gift_weight))} · ${night.gloss}` : night.gloss }));
        },
        apply: (draft, id) => { const night = nights.find(item => item.id === id); return night ? { ...draft, night: night.id } : draft; } },
      { id: 'watch', kind: 'preview', label: 'Watched', continue_label: 'Seen it',
        prompt: 'The picture above plays the night at speed. I read it out as it goes:',
        render: draft => {
          const item = findItem(access, draft.visual);
          if (!item || !draft.night) return null;
          return createElement(NightNarration, { name: item.visual.name, night: sampleNight(draft.night),
            trace: nightTrace(item.visual.curve, draft.night, item.gift_weight), curve: item.visual.curve });
        },
        lines: draft => nightLines(findItem(access, draft.visual), draft.night, false) },
      { id: 'move', kind: 'choice', label: 'Then', prompt: 'What now?',
        when: draft => moveOptions(findItem(access, draft.visual), draft.night).length > 1,
        options: draft => moveOptions(findItem(access, draft.visual), draft.night),
        apply: (draft, id) => ({ ...draft, move: id === 'fit' ? 'fit' : 'keep' }) },
      { id: 'seal', kind: 'confirm', label: 'Seal', prompt: 'Hold to seal this curve.', note: scope(access),
        lines: draft => [{ label: 'Beacon', value: nameOf(access, draft.visual) }, ...nightLines(findItem(access, draft.visual), draft.night, draft.move === 'fit')] },
    ],
    seal: async draft => {
      const item = findItem(access, draft.visual);
      if (!item || !draft.night) throw new Error('Nothing to seal');
      const curve = draft.move === 'fit' ? fittedCurve(item.visual.curve, draft.night, item.gift_weight) : item.visual.curve;
      const phrase = nightPhrase(nightTrace(curve, draft.night, item.gift_weight));
      await access.tune({ ...item.visual, curve }, `${nightName(draft.night)} · ${phrase}`);
      return { say: draft.move === 'fit' ? `Sealed. The ${item.visual.name} now fits the ${nightName(draft.night).toLowerCase()}: ${phrase}.`
        : `Sealed. The ${item.visual.name} keeps its curve: ${phrase} on the ${nightName(draft.night).toLowerCase()}.` };
    },
  });
}

function demoFlow(access: Access) {
  const target = (draft: DemoDraft) => {
    const found = demoCases.find(item => item.id === draft.case);
    const fixture = fixtureBeacons().getSnapshot().visuals.find(item => item.visual.visual_id === found?.visual);
    return found && fixture ? { found, item: fixture } : undefined;
  };
  return defineFlow<DemoDraft>({
    id: flow_ids.demo, chamber: 'visuals', title: 'Play demo · a sample night', simulated: true,
    intents: ['demo', 'play demo', 'show me', 'how does it work'],
    intro: 'Let support change how your stream looks: gift subs and subs make an on-screen frame glow brighter, then cool off, so viewers feel the room’s energy. One sample night at speed; every contribution is SIMULATED.',
    initial: () => ({ case: 'gift_wave' }),
    steps: [
      { id: 'case', kind: 'preset', label: 'Night', prompt: 'Pick a night to play. The picture above starts it at once.',
        presets: () => demoCases.map(item => ({ id: item.id, label: item.label, consequence: item.line, simulated: true })),
        apply: (draft, id) => { const found = demoCases.find(item => item.id === id); return found ? { ...draft, case: found.id } : draft; } },
      { id: 'watch', kind: 'preview', label: 'Watched', continue_label: 'Seen it',
        prompt: 'Watch the picture above: each gift or sub lands top left and the frame glows brighter; in quiet spells it cools by half every few minutes. Bits and channel points do not count here.',
        render: draft => {
          const chosen = target(draft);
          if (!chosen) return null;
          return createElement(NightNarration, { name: chosen.item.visual.name, night: sampleNight(chosen.found.night),
            trace: nightTrace(chosen.item.visual.curve, chosen.found.night, chosen.item.gift_weight), curve: chosen.item.visual.curve });
        },
        lines: draft => { const chosen = target(draft); return chosen ? nightLines(chosen.item, chosen.found.night, false) : []; } },
      { id: 'move', kind: 'choice', label: 'Then', prompt: 'One choice: should it fill more slowly or quickly for nights like this? The curve is how much support it takes to glow.',
        when: draft => { const chosen = target(draft); return !!chosen && !!replayMoves(chosen.item.visual.curve, chosen.found.night, chosen.item.gift_weight).fit; },
        options: draft => {
          const chosen = target(draft);
          if (!chosen) return [];
          const { trace, fit } = replayMoves(chosen.item.visual.curve, chosen.found.night, chosen.item.gift_weight);
          return [{ id: 'keep', label: 'Keep it as it is', consequence: `On this night it ${nightPhrase(trace)}` },
            ...(fit ? [{ id: 'fit', label: 'Fit it to nights like this', consequence: `It ${nightPhrase(nightTrace(fittedCurve(chosen.item.visual.curve, chosen.found.night), chosen.found.night))} instead · plays again above` }] : [])];
        },
        apply: (draft, id) => ({ ...draft, move: id === 'fit' ? 'fit' : 'keep' }) },
      { id: 'seal', kind: 'confirm', label: 'Seal', prompt: 'Hold to seal. The curve is kept in this sample room only.',
        note: 'SIMULATED demo. It changes the sample room only; nothing reaches OBS, chat or a viewer.',
        lines: draft => {
          const chosen = target(draft);
          return chosen ? [{ label: 'Beacon', value: chosen.item.visual.name }, ...nightLines(chosen.item, chosen.found.night, draft.move === 'fit')] : [];
        } },
    ],
    seal: async draft => {
      const chosen = target(draft);
      if (!chosen) throw new Error('No demo night chosen');
      const { item, found } = chosen;
      const curve = draft.move === 'fit' ? fittedCurve(item.visual.curve, found.night, item.gift_weight) : item.visual.curve;
      const phrase = nightPhrase(nightTrace(curve, found.night, item.gift_weight));
      // The demo always lands in the local sample room; in core mode it also sends one routed test burst.
      await fixtureAccess().tune({ ...item.visual, curve }, `Demo · ${nightName(found.night)} · ${phrase}`);
      const core = access.core ? access.items().find(value => value.visual.input?.source === 'gift' || value.visual.input?.source === 'subscribe') : undefined;
      const burst = core && shots.find(shot => shot.source === core.visual.input?.source);
      if (core && burst) await access.fire(core.visual.visual_id, burst);
      return { say: `That was the demo. On the ${nightName(found.night).toLowerCase()} the ${item.visual.name.toLowerCase()} ${phrase}. What you saw: support builds the glow and quiet lets it cool, so viewers feel the room’s energy without anyone reading a number. Next: tune a beacon for your channel, or test fire one.`,
        lines: [{ label: 'Kept', value: 'In the sample room only · SIMULATED' },
          ...(core && burst ? [{ label: 'Core', value: `One simulated ${burst.label.toLowerCase()} sent to ${core.visual.name}` }] : [])],
        chips: [{ label: 'Tune a beacon', action: { kind: 'flow', chamber: 'visuals', flow: flow_ids.tune } },
          { label: 'Test fire', action: { kind: 'flow', chamber: 'visuals', flow: flow_ids.test } }] };
    },
  });
}

export function visualsSteward(snapshot: Snapshot): ChamberSteward {
  const access = beaconsAccess(snapshot);
  const base = roomSteward('visuals', snapshot, ['beacon', 'beacons', 'visual', 'altar', 'overlay', 'frame', 'border', 'blaze']);
  const selected = findItem(access, access.selected());
  return { ...base,
    greeting: selected ? `The Beacons: support changes how the stream looks. The ${selected.visual.name.toLowerCase()} is on screen${access.core ? '' : ` at ${percent(curveIntensity(selected.visual.curve, selected.total))} blaze`}. Tune it, test fire it, or play the demo; nothing acts until you hold to seal.`
      : base.greeting,
    flows: [tuneFlow(access), testFlow(access), replayFlow(access)], demo: demoFlow(access) };
}
