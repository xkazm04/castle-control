import type { LotsDraw } from '@castle-control/contract';
import type { DrawShape } from '@castle-control/renderer';
import { defineFlow, stewardDock } from '@castle-control/ui/steward-flow';
import type { FlowOption } from '@castle-control/ui/steward-flow';
import { coreLotsConnection } from '../../client.js';
import type { CoreLotsPort } from '../../lots-core.js';
import type { Snapshot } from '../../model.js';
import { lotLive } from './live.js';
import type { Fairness } from './flow-model.js';
import { capLine, cooldownLine, fairnessOptions, guardrailLines, oddsLine, poolLabel, questionDraw, shapeNames, shapeOptions, withFairness,
  withPool, withRules } from './flow-model.js';
import { actions, revealOptions, showLab } from './flow-steps.js';
import type { CastDraft, RevealStyle } from './flow-steps.js';

/** Core-mode flows: the same journeys on the core's draws, ending on the core's own seal and cast. */
export type CoreSetupDraft = { pick?: string; winners?: number; other?: boolean; fairness?: Fairness | 'keep'; shape?: DrawShape };

async function corePort(snapshot: Snapshot): Promise<CoreLotsPort> {
  const connection = coreLotsConnection(snapshot);
  if (!connection) throw new Error('The core is not connected.');
  if (!connection.port) {
    const { createCoreLotsPort } = await import('../../lots-core.js');
    connection.port = createCoreLotsPort(connection.launch, connection.transport);
  }
  return connection.port;
}

/** What the draft would do to a core draw: winner count and fairness only; pool and prize stay the core's. */
export function applyCoreDraft(draft: CoreSetupDraft, draw: LotsDraw): LotsDraw {
  const counted = draft.winners ? withRules(draw, { winner_count: draft.winners }) : draw;
  return draft.fairness && draft.fairness !== 'keep' && draft.fairness !== 'each' ? withFairness(counted, draft.fairness) : counted;
}
/** The draw the stage previews while drafting; a new draw previews the core's question template. */
export function coreDraftDraw(draft: CoreSetupDraft): LotsDraw | undefined {
  const live = lotLive.get();
  const picked = draft.pick === 'new'
    ? withRules(withPool({ ...questionDraw(), name: 'Questions for the hall · no prize' }, 'keyword'), { winner_count: 1, cohort_caps: [], cooldown_s: 0 })
    : live.draws.find(item => item.draw_id === draft.pick) ?? live.draw;
  return picked ? applyCoreDraft(draft, picked) : undefined;
}
const corePresets: readonly FlowOption[] = [...fairnessOptions.filter(option => option.id === 'balanced' || option.id === 'open'),
  { id: 'keep', label: 'Keep this draw’s rules', consequence: 'Cap, cooldown and odds stay as the core holds them.' }];

export function coreFlows(snapshot: Snapshot) {
  const setup = defineFlow<CoreSetupDraft>({
    id: 'lots-setup', chamber: 'lottery', title: 'Set up a draw', chip: 'Set up a draw',
    intents: ['set up a draw', 'new draw', 'draw', 'giveaway', 'raffle', 'lottery', 'questions'],
    intro: 'Let’s set up a draw on the core. The stage shows it as you choose; nothing acts until you hold to seal.',
    initial: () => ({}),
    steps: [
      { id: 'draw', kind: 'choice', label: 'Draw', prompt: 'Which draw?',
        options: () => {
          const draws = lotLive.get().draws;
          return [...draws.slice(-4).reverse().map(draw => ({ id: draw.draw_id, label: draw.name,
            ...(draw.draw_id.startsWith('simulated-') ? { tag: 'SIMULATED' } : {}),
            consequence: `${poolLabel[draw.rules.pool.kind]} · ${draw.rules.winner_count} winners · ${draw.policy.content}` })),
            ...(draws.some(draw => draw.draw_id === 'questions') ? [] : [{ id: 'new', label: 'New: questions for the hall',
              consequence: 'No prize · anyone who types !join · created in the core on the hold.' }])];
        },
        apply: (draft, id) => ({ ...draft, pick: id }) },
      { id: 'winners', kind: 'choice', label: 'Winners', prompt: 'How many winners?',
        options: draft => [1, 3, 7, 15].map(value => ({ id: String(value), label: `${value} winner${value === 1 ? '' : 's'}`,
          ...(coreDraftDraw(draft.pick ? { pick: draft.pick } : {})?.rules.winner_count === value ? { tag: 'Now' } : {}),
          consequence: 'Must fit the roll when it freezes.' } as FlowOption)).concat([{ id: 'other', label: 'Another number', consequence: 'Any count up to 65,535.' }]),
        summary: draft => String(draft.winners ?? 'other'),
        apply: (draft, id) => id === 'other' ? { ...draft, other: true } : { ...draft, other: false, winners: Number(id) } },
      { id: 'winners_n', kind: 'field', label: 'Exactly', input: 'number', prompt: 'How many, exactly?', when: draft => draft.other === true,
        validate: raw => { const value = Number(raw); return Number.isInteger(value) && value >= 1 && value <= 65_535 ? null : 'Use a whole number from 1 to 65,535.'; },
        apply: (draft, raw) => ({ ...draft, winners: Number(raw) }) },
      { id: 'fairness', kind: 'preset', label: 'Fairness', prompt: 'How should fairness lean?', presets: () => corePresets,
        apply: (draft, id) => ({ ...draft, fairness: id === 'balanced' || id === 'open' ? id : 'keep' }) },
      { id: 'shape', kind: 'choice', label: 'On stream', prompt: 'How should it look on the stage? Watch it above.', options: () => shapeOptions,
        apply: (draft, id) => shapeOptions.some(option => option.id === id) ? { ...draft, shape: id as DrawShape } : draft },
      { id: 'check', kind: 'preview', label: 'Guardrail check', continue_label: 'Looks right',
        prompt: 'A local mirror of the guardrails. The core checks again on the hold; a blocked draw does not seal.',
        lines: draft => { const draw = coreDraftDraw(draft); return draw ? guardrailLines(draw) : [{ label: 'Draw', value: 'Not chosen' }]; } },
      { id: 'seal', kind: 'confirm', label: 'Seal', prompt: 'Hold to seal on the core. The entry list freezes and a future public round is announced.',
        note: 'The core saves these rules, checks the guardrails, then seals. A cast waits for the round.',
        lines: draft => { const draw = coreDraftDraw(draft); return draw ? [{ label: 'Draw', value: draw.name },
          { label: 'Winners', value: String(draw.rules.winner_count) }, { label: 'Raiders', value: capLine(draw) },
          { label: 'Cooldown', value: cooldownLine(draw.rules.cooldown_s) }, { label: 'Odds', value: oddsLine(draw) },
          ...(draft.shape ? [{ label: 'On stage', value: shapeNames[draft.shape] }] : [])] : []; } },
    ],
    seal: async draft => {
      if (!draft.pick) throw new Error('Choose a draw.');
      const lines = await (await actions()).sealCoreDraw(await corePort(snapshot), draft.pick, draw => applyCoreDraft(draft, draw), draft.shape);
      stewardDock.collapse();
      return { say: 'Sealed on the core. The cast waits for the announced public round; cast the lots once it arrives.', lines };
    },
  });
  const cast = defineFlow<CastDraft & { seal_only?: boolean }>({
    id: 'lots-cast', chamber: 'lottery', title: 'Cast the lots', chip: 'Cast the lots',
    intents: ['cast the lots', 'cast', 'draw winners', 'reveal'], intro: 'Time to cast. Nothing is drawn until you hold.', initial: () => ({}),
    steps: [
      { id: 'ready', kind: 'choice', label: 'Roll', when: () => lotLive.get().phase === 'open', prompt: 'Nothing is sealed yet, so there is nothing to cast.',
        options: () => lotLive.get().draw ? [{ id: 'seal', label: `Seal ${lotLive.get().draw?.name ?? 'the selected draw'} first`,
          consequence: 'The hold seals it on the core. Cast once its public round arrives.' }] : [],
        apply: draft => ({ ...draft, seal_only: true }) },
      { id: 'round', kind: 'preview', label: 'Public round', continue_label: 'Cast when ready', when: draft => !draft.seal_only,
        prompt: 'The cast waits for the public drand round announced at the seal. If it has not arrived, the hold says so and nothing changes.',
        lines: () => { const live = lotLive.get(); return [{ label: 'Draw', value: live.draw?.name ?? 'Not chosen' },
          { label: 'Lots frozen', value: String(live.entries) }, { label: 'Round', value: live.round ?? 'Announced at the seal' }]; } },
      { id: 'style', kind: 'choice', label: 'Reveal', prompt: 'How should the winners appear?', options: () => revealOptions, when: draft => !draft.seal_only,
        apply: (draft, id) => revealOptions.some(option => option.id === id) ? { ...draft, style: id as RevealStyle } : draft },
      { id: 'cast', kind: 'confirm', label: 'Cast', prompt: 'Hold to cast. A cast is final: it is never replaced or re-rolled.',
        note: 'The core derives the winners from the public round and returns its proof bundle.',
        lines: draft => [{ label: 'Draw', value: lotLive.get().draw?.name ?? 'Not chosen' },
          { label: 'Action', value: draft.seal_only ? 'Seal only' : `Cast · ${revealOptions.find(option => option.id === draft.style)?.label ?? ''}` }] },
    ],
    seal: async draft => {
      const port = await corePort(snapshot);
      if (draft.seal_only) {
        const draw = port.getSnapshot().draw;
        if (!draw) throw new Error('No draw selected.');
        const lines = await (await actions()).sealCoreDraw(port, draw.draw_id, same => same, undefined);
        stewardDock.collapse();
        return { say: 'Sealed on the core. Cast the lots once the public round arrives.', lines };
      }
      const lines = await (await actions()).castCore(port, draft.style ?? 'quiet');
      stewardDock.collapse();
      return { say: 'Cast on the core. The winners are revealed on the stage.', lines };
    },
  });
  const prove = defineFlow<{ tamper?: string }>({
    id: 'lots-prove', chamber: 'lottery', title: 'Prove it', chip: 'Prove it', intents: ['prove it', 'proof', 'verify', 'writ lab', 'tamper'],
    intro: 'Anyone can check this writ. The Writ Lab opens below the stage.', initial: () => ({}),
    steps: [
      { id: 'tamper', kind: 'choice', label: 'Forgery', prompt: 'Shall we try to cheat? Change one thing in a copy and the proof should refuse it.',
        options: () => [{ id: 'none', label: 'No, just walk the proof', consequence: 'Roll, seal, round and winners are recomputed.' },
          { id: 'weight', label: 'Add 1 to a lot’s weight', consequence: 'The seal should no longer match.' },
          { id: 'winners', label: 'Swap two winners', consequence: 'The round gives a different order.' },
          { id: 'forge', label: 'Forge the beacon', consequence: 'The BLS signature should refuse it.' }],
        apply: (draft, id) => ({ ...draft, tamper: id }) },
      { id: 'verdict', kind: 'confirm', label: 'Verdict', prompt: 'Hold to run the four checks and log the verdict.',
        note: 'Recomputed in this window against the public quicknet key.', lines: draft => [{ label: 'Forgery', value: draft.tamper ?? 'none' }] },
    ],
    seal: async draft => {
      const kind = draft.tamper === 'weight' || draft.tamper === 'winners' || draft.tamper === 'forge' ? draft.tamper : undefined;
      const verdict = await (await actions()).proveWrit('cast', kind, await corePort(snapshot));
      stewardDock.collapse();
      showLab();
      return verdict;
    },
  });
  return { setup, cast, prove };
}
