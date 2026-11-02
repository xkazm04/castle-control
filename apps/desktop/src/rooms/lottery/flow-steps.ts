import type { LotsDraw } from '@castle-control/contract';
import type { DrawShape } from '@castle-control/renderer';
import { defineFlow, stewardDock } from '@castle-control/ui/steward-flow';
import type { FlowLine, FlowOption } from '@castle-control/ui/steward-flow';
import { lotsCopy as copy } from '../../lots-copy.js';
import { checkFixturePolicy } from '../../lots-model.js';
import { lotLive } from './live.js';
import type { Fairness, PoolKind, SetupDraft, SetupPreset } from './flow-model.js';
import { capOf, capOptions, contentLine, cooldownOptions, drawLines, fairnessOptions, guardrailLines, lotCount, noPrize, oddsOptions,
  parseWinners, poolLabel, presetDraw, questionDraw, shapeNames, shapeOptions, winnerOptions, withFairness, withOdds, withPolicy,
  withPool, withRules } from './flow-model.js';

/** Fixture-mode Steward flows for the Lot Chamber. Seals load flow-actions on demand. */
export type { RevealStyle } from './flow-model.js';
import type { RevealStyle } from './flow-model.js';
export const actions = () => import('./flow-actions.js');
const shapes = new Set<string>(shapeOptions.map(option => option.id));
const isShape = (id: string): id is DrawShape => shapes.has(id);
const prize = (draft: SetupDraft) => draft.draw.policy.content === 'prize';
const pools: readonly PoolKind[] = ['chatters', 'keyword', 'followers', 'subscribers', 'redeemers'];
/** Every lottery seal lowers the sheet, so the stage it changed is in full view. */
const lower = () => stewardDock.collapse();
/** After a verdict the lowered sheet uncovers the Writ Lab; bring it into view. */
export const showLab = () => {
  if (typeof requestAnimationFrame === 'undefined') return;
  requestAnimationFrame(() => document.querySelector('.lottery-lab-bay')?.scrollIntoView({ block: 'start' }));
};

export const revealOptions: readonly FlowOption[] = [
  { id: 'ceremony', label: 'Full ceremony', consequence: 'The stage fills the chamber and each winner rings a bell.' },
  { id: 'quiet', label: 'One by one, quietly', consequence: 'The same reveal in cast order, without sound.' },
  { id: 'hand', label: 'By hand', consequence: 'You call each lot with Space. The order is already fixed by the seal.' },
];
const revealName = (id: string | undefined) => revealOptions.find(option => option.id === id)?.label ?? 'Not chosen';

const presets: readonly FlowOption[] = [
  { id: 'question', label: copy.question_name, tag: 'No prize', consequence: 'Three winners from everyone chatting, equal odds. Nothing to clear.' },
  { id: 'prize', label: 'Free-entry prize', tag: 'Prize', consequence: 'Anyone can win for free. Needs official rules and the Twitch disclaimer before it seals.' },
  { id: 'custom', label: 'Something else', consequence: 'Start from a question draw and choose what it is for and what it is called.' },
  { id: 'paid', label: 'Paid-weight prize', tag: 'Blocked example', consequence: 'See the guardrail stop money from buying better odds.' },
];
const guard = (yes: FlowOption): FlowOption[] => [yes,
  { id: 'no_prize', label: 'Make it a no-prize draw', consequence: 'Keep everything else; there is nothing to give away, so nothing to clear.' }];

export const setupFlow = defineFlow<SetupDraft>({
  id: 'lots-setup', chamber: 'lottery', title: 'Set up a draw', chip: 'Set up a draw', simulated: true,
  intents: ['set up a draw', 'new draw', 'draw', 'giveaway', 'raffle', 'lottery', 'questions', 'pick winners'],
  intro: 'Let’s set up a draw. The stage above shows it as you choose. Nothing acts until you hold to seal.',
  initial: () => ({ draw: questionDraw() }),
  steps: [
    { id: 'kind', kind: 'preset', label: 'Draw', prompt: 'What are we drawing for?', presets: () => presets,
      apply: (draft, id) => presets.some(option => option.id === id) ? { ...draft, preset: id as SetupPreset, draw: presetDraw(id as SetupPreset) } : draft },
    { id: 'content', kind: 'choice', label: 'For', prompt: 'What is it for?', when: draft => draft.preset === 'custom',
      options: () => copy.content_options.map(option => ({ id: option.value, label: option.label, consequence: option.value === 'prize'
        ? 'Something to give away: the guardrails will ask for rules and a disclaimer.' : 'No prize: nothing to clear before the seal.' })),
      apply: (draft, id) => {
        const option = copy.content_options.find(item => item.value === id);
        if (!option) return draft;
        return { ...draft, draw: withPolicy(draft.draw, { content: option.value,
          prize_value_usd_cents: option.value === 'prize' ? draft.draw.policy.prize_value_usd_cents || 2500 : 0 }) };
      } },
    { id: 'name', kind: 'field', label: 'Name', prompt: 'What should the stream call it?', when: draft => draft.preset === 'custom',
      placeholder: 'Questions for the hall', initial: draft => draft.draw.name,
      validate: raw => raw.trim() && raw.trim().length <= 60 ? null : 'Use a name of 1 to 60 characters.',
      apply: (draft, raw) => ({ ...draft, draw: { ...draft.draw, name: raw.trim() } }) },
    { id: 'pool', kind: 'choice', label: 'Who can enter', prompt: 'Who can enter? The roll on the stage fills with them.',
      options: draft => pools.map(kind => {
        const next = withPool(draft.draw, kind);
        const review = prize(draft) && (kind === 'subscribers' || kind === 'redeemers');
        return { id: kind, label: poolLabel[kind], tag: `${lotCount(next)} lots`,
          consequence: review ? 'Allowed, but a prize limited this way needs review before live use.'
            : kind === 'keyword' ? 'Only viewers who type !join in chat enter.' : kind === 'chatters' ? 'Everyone who chats is in the roll.'
              : kind === 'followers' ? 'Followers who chat are in the roll.' : 'Free !join still counts with equal odds.' };
      }),
      apply: (draft, id) => pools.includes(id as PoolKind) ? { ...draft, draw: withPool(draft.draw, id as PoolKind) } : draft },
    { id: 'winners', kind: 'choice', label: 'Winners', prompt: 'How many winners?',
      options: draft => winnerOptions(lotCount(draft.draw), draft.draw.rules.winner_count),
      summary: draft => String(draft.draw.rules.winner_count),
      apply: (draft, id) => id === 'other' ? { ...draft, other: true }
        : { ...draft, other: false, draw: withRules(draft.draw, { winner_count: Number(id) }) } },
    { id: 'winners_n', kind: 'field', label: 'Exactly', input: 'number', prompt: 'How many, exactly?', when: draft => draft.other === true,
      initial: draft => String(draft.draw.rules.winner_count), validate: (raw, draft) => parseWinners(raw, lotCount(draft.draw)),
      apply: (draft, raw) => ({ ...draft, draw: withRules(draft.draw, { winner_count: Number(raw) }) }) },
    { id: 'fairness', kind: 'preset', label: 'Fairness', prompt: 'How should fairness lean?', presets: () => fairnessOptions,
      apply: (draft, id) => fairnessOptions.some(option => option.id === id)
        ? { ...draft, fairness: id as Fairness, draw: withFairness(draft.draw, id as Fairness) } : draft },
    { id: 'cap', kind: 'choice', label: 'Raiders', prompt: 'A raid can flood the roll. How many winners may raiders take?',
      when: draft => draft.fairness === 'each', options: () => capOptions,
      apply: (draft, id) => ({ ...draft, draw: withRules(draft.draw, { cohort_caps: capOf(id === 'none' ? null : Number(id)) }) }) },
    { id: 'cooldown', kind: 'choice', label: 'Cooldown', prompt: 'Should recent winners sit this one out?',
      when: draft => draft.fairness === 'each', options: () => cooldownOptions,
      apply: (draft, id) => ({ ...draft, draw: withRules(draft.draw, { cooldown_s: Number(id) }) }) },
    { id: 'odds', kind: 'choice', label: 'Odds', prompt: 'Does chat activity tilt the odds?', when: draft => draft.fairness === 'each',
      options: () => oddsOptions, apply: (draft, id) => ({ ...draft, draw: withOdds(draft.draw, id === 'activity' ? 'activity' : 'equal') }) },
    { id: 'paid', kind: 'choice', label: 'Paid weight', when: draft => prize(draft) && (draft.draw.policy.paid_weight || draft.draw.policy.paid_entry),
      prompt: 'This is blocked: on a prize draw, money may never buy entry or better odds. How shall we fix it?',
      options: () => guard({ id: 'remove', label: 'Remove paid weight', consequence: 'Everyone weighs the same and entry stays free.' }),
      apply: (draft, id) => ({ ...draft, draw: id === 'remove' ? withPolicy(draft.draw, { paid_weight: false, paid_entry: false }) : noPrize(draft.draw) }) },
    { id: 'value', kind: 'field', label: 'Prize value', input: 'number', when: prize, prompt: 'What is the prize worth, in US dollars?',
      hint: 'Prizes over $5,000 need confirmed registration.', initial: draft => String(draft.draw.policy.prize_value_usd_cents / 100),
      validate: raw => { const value = Number(raw); return raw.trim() && Number.isFinite(value) && value >= 0 && value <= 1_000_000 ? null : 'Use an amount from 0 to 1,000,000.'; },
      summary: draft => contentLine(draft.draw),
      apply: (draft, raw) => ({ ...draft, draw: withPolicy(draft.draw, { prize_value_usd_cents: Math.round(Number(raw) * 100) }) }) },
    { id: 'registration', kind: 'choice', label: 'Registration', prompt: 'A prize over $5,000 needs confirmed registration before it seals.',
      when: draft => prize(draft) && draft.draw.policy.prize_value_usd_cents > 500_000 && !draft.draw.policy.registration_confirmed,
      options: () => [{ id: 'confirmed', label: 'Registration is confirmed', consequence: 'You confirm the promotion is registered where required.' },
        { id: 'lower', label: 'Lower it to $5,000', consequence: 'Keeps the prize under the registration line.' }],
      apply: (draft, id) => ({ ...draft, draw: withPolicy(draft.draw, id === 'confirmed' ? { registration_confirmed: true } : { prize_value_usd_cents: 500_000 }) }) },
    { id: 'rules', kind: 'choice', label: 'Official rules', when: draft => prize(draft) && !draft.draw.policy.official_rules,
      prompt: 'A prize draw needs official rules attached before it can seal.',
      options: () => guard({ id: 'attach', label: 'Attach the rules template', tag: 'Sample', consequence: copy.template_text }),
      apply: (draft, id) => ({ ...draft, draw: id === 'attach' ? withPolicy(draft.draw, { official_rules: true }) : noPrize(draft.draw) }) },
    { id: 'disclaimer', kind: 'choice', label: 'Twitch disclaimer', when: draft => prize(draft) && !draft.draw.policy.twitch_disclaimer,
      prompt: 'Viewers must be told that Twitch is not behind this prize.',
      options: () => guard({ id: 'acknowledge', label: 'Acknowledge the disclaimer', consequence: copy.disclaimer_text }),
      apply: (draft, id) => ({ ...draft, draw: id === 'acknowledge' ? withPolicy(draft.draw, { twitch_disclaimer: true }) : noPrize(draft.draw) }) },
    { id: 'shape', kind: 'choice', label: 'On stream', prompt: 'How should it look on stream? Watch the stage.', options: () => shapeOptions,
      apply: (draft, id) => isShape(id) ? { ...draft, shape: id } : draft },
    { id: 'check', kind: 'preview', label: 'Guardrail check', prompt: 'The guardrail check, before anything freezes.', continue_label: 'Looks right',
      lines: draft => [...guardrailLines(draft.draw), { label: 'Roll', value: `${lotCount(draft.draw)} SIMULATED lots · generated, no Twitch data` }] },
    { id: 'seal', kind: 'confirm', label: 'Seal', prompt: 'Hold to seal. The entry list freezes and its hash is recorded before any randomness exists.',
      note: 'SIMULATED roll of generated viewers on this machine. Nothing reaches chat or OBS. Casting comes next.',
      lines: draft => drawLines(draft.draw, draft.shape) },
  ],
  seal: async draft => {
    if (checkFixturePolicy(draft.draw.policy).result === 'blocked') throw new Error('Blocked');
    const lines = await (await actions()).sealFixtureDraw(draft.draw, draft.shape ?? 'urn');
    lower();
    return { say: `Sealed: ${draft.draw.name}. The roll is frozen; cast the lots when you are ready.`, lines };
  },
});

export type CastDraft = { first?: 'sample' | 'again'; style?: RevealStyle };
const castSteps = (simulated: boolean) => [
  { id: 'round', kind: 'preview' as const, label: 'Public round', continue_label: 'The round is ready',
    prompt: simulated ? 'A live cast waits for the public drand round announced at the seal. This rehearsal commits to a SIMULATED seed, so its round is ready now.'
      : 'The cast waits for the public drand round announced at the seal. If it has not arrived, the hold tells you and nothing changes.',
    lines: (): FlowLine[] => {
      const live = lotLive.get();
      return [{ label: 'Draw', value: live.draw?.name ?? copy.question_name },
        { label: 'Lots frozen', value: live.phase === 'open' ? 'Sealed on the hold' : String(live.entries) },
        { label: 'Seal', value: live.seal ? `${live.seal.slice(0, 8)}…${live.seal.slice(-4)}` : 'Not yet' },
        { label: 'Round', value: live.round ?? (simulated ? 'SIMULATED commit · ready' : 'Announced at the seal') }];
    } },
  { id: 'style', kind: 'choice' as const, label: 'Reveal', prompt: 'How should the winners appear?', options: () => revealOptions,
    apply: (draft: CastDraft, id: string) => revealOptions.some(option => option.id === id) ? { ...draft, style: id as RevealStyle } : draft },
  { id: 'cast', kind: 'confirm' as const, label: 'Cast', prompt: 'Hold to cast. A cast is final: it is never replaced or re-rolled.',
    note: simulated ? 'SIMULATED cast of generated viewers. Nothing reaches chat or OBS.' : 'The core derives the winners from the public round.',
    lines: (draft: CastDraft): FlowLine[] => [{ label: 'Draw', value: lotLive.get().draw?.name ?? copy.question_name },
      { label: 'Reveal', value: revealName(draft.style) }] },
];

export const castFlow = defineFlow<CastDraft>({
  id: 'lots-cast', chamber: 'lottery', title: 'Cast the lots', chip: 'Cast the lots', simulated: true,
  intents: ['cast the lots', 'cast', 'draw winners', 'reveal', 'pick the winners now'],
  intro: 'Time to cast. Nothing is drawn until you hold.', initial: () => ({}),
  steps: [
    { id: 'ready', kind: 'choice', label: 'Roll', when: () => lotLive.get().phase === 'open',
      prompt: 'Nothing is sealed yet, so there is nothing to cast.',
      options: () => [{ id: 'sample', label: 'Seal the sample draw first', tag: 'SIMULATED',
        consequence: `${copy.question_name} · 3 winners. The hold seals it, then casts.` }],
      apply: draft => ({ ...draft, first: 'sample' }) },
    { id: 'again', kind: 'choice', label: 'Roll', when: () => lotLive.get().phase === 'cast',
      prompt: 'This roll is already cast, and a cast is never replaced.',
      options: () => [{ id: 'again', label: 'Rehearse again', consequence: 'Draft a fresh roll from the same setup, seal it, then cast.' }],
      apply: draft => ({ ...draft, first: 'again' }) },
    ...castSteps(true),
  ],
  seal: async draft => {
    const act = await actions();
    const phase = lotLive.get().phase;
    if (phase === 'open') await act.sealFixtureDraw(draft.first === 'sample' ? questionDraw() : act.fixtureDrawNow(), act.fixtureShapeNow());
    if (phase === 'cast') { act.reopenFixture(); await act.sealFixtureDraw(act.fixtureDrawNow(), act.fixtureShapeNow()); }
    const lines = await act.castFixture(draft.style ?? 'quiet');
    lower();
    return { say: draft.style === 'hand' ? 'Cast. The order is fixed; call each lot on the stage with Space.'
      : 'Cast. The winners are revealed on the stage in cast order.', lines };
  },
});

export type ProveDraft = { writ?: 'cast' | 'specimen' | 'beacon'; tamper?: string };
const tamperOptions = (beacon: boolean): FlowOption[] => [
  { id: 'none', label: 'No, just walk the proof', consequence: 'Roll, seal, seed and winners are recomputed and compared.' },
  { id: 'weight', label: 'Add 1 to a lot’s weight', consequence: 'The seal should no longer match the roll.' },
  { id: 'handle', label: 'Alter a handle', consequence: 'Change one name in the frozen roll.' },
  { id: 'winners', label: 'Swap two winners', consequence: 'Claim a different order than the seed gives.' },
  beacon ? { id: 'forge', label: 'Forge the beacon', consequence: 'The BLS signature should refuse it.' }
    : { id: 'seed', label: 'Flip a seed bit', consequence: 'The revealed seed should betray its commitment.' },
];
export const tamperKinds = new Set(['weight', 'handle', 'winners', 'forge', 'seed']);

export const proveFlow = defineFlow<ProveDraft>({
  id: 'lots-prove', chamber: 'lottery', title: 'Prove it', chip: 'Prove it', simulated: true,
  intents: ['prove it', 'proof', 'verify', 'writ lab', 'tamper', 'is it fair'],
  intro: 'Anyone can check a writ. Pick one and the Writ Lab opens below the stage.', initial: () => ({}),
  steps: [
    { id: 'writ', kind: 'choice', label: 'Writ', prompt: 'Which writ shall we prove?',
      options: () => [
        ...(lotLive.get().writ ? [{ id: 'cast', label: 'This cast’s writ', tag: 'SIMULATED', consequence: 'The roll you just sealed and cast.' }] : []),
        { id: 'specimen', label: 'The saved specimen', consequence: 'A fixed simulated writ from the verifier corpus.' },
        { id: 'beacon', label: 'The simulated beacon writ', consequence: 'drand-style randomness on a simulated chain, with its BLS signature.' }],
      apply: (draft, id) => ({ ...draft, writ: id === 'cast' || id === 'beacon' ? id : 'specimen' }) },
    { id: 'tamper', kind: 'choice', label: 'Forgery', prompt: 'Shall we try to cheat? Change one thing in a copy and the proof should refuse it.',
      options: draft => tamperOptions(draft.writ === 'beacon'), apply: (draft, id) => ({ ...draft, tamper: id }) },
    { id: 'verdict', kind: 'confirm', label: 'Verdict', prompt: 'Hold to run the four checks and log the verdict.',
      note: 'Recomputed offline in this window. Nothing is published or fetched.',
      lines: draft => [{ label: 'Writ', value: draft.writ === 'cast' ? 'This cast' : draft.writ === 'beacon' ? 'Simulated beacon writ' : 'Saved specimen' },
        { label: 'Forgery', value: tamperOptions(draft.writ === 'beacon').find(option => option.id === draft.tamper)?.label ?? 'None' }] },
  ],
  seal: async draft => {
    const kind = draft.tamper && tamperKinds.has(draft.tamper) ? draft.tamper as 'weight' : undefined;
    const verdict = await (await actions()).proveWrit(draft.writ ?? 'specimen', kind);
    lower();
    showLab();
    return verdict;
  },
});

export type DemoDraft = { sample?: 'question' | 'prize'; cleared?: boolean };
export function demoDraw(draft: DemoDraft): LotsDraw {
  if (draft.sample !== 'prize') return questionDraw();
  const draw = presetDraw('prize');
  return draft.cleared ? withPolicy(draw, { official_rules: true, twitch_disclaimer: true }) : draw;
}
export const demoShape = (draft: DemoDraft): DrawShape => draft.sample === 'prize' ? 'wheel' : 'urn';

export const demoFlow = defineFlow<DemoDraft>({
  id: 'lots-demo', chamber: 'lottery', title: 'Play demo · a fair draw', simulated: true, intents: ['demo', 'show me', 'play demo'],
  intro: 'A SIMULATED draw, end to end: 87 generated viewers, a sealed roll, a cast you can prove.', initial: () => ({}),
  steps: [
    { id: 'sample', kind: 'preset', label: 'Sample', prompt: 'Pick a sample draw. The stage above shows it.',
      presets: () => [
        { id: 'question', label: copy.question_name, tag: 'Urn', consequence: 'No prize · 3 winners · everyone chatting.', simulated: true },
        { id: 'prize', label: 'Free-entry prize', tag: 'Wheel', consequence: 'A $25 prize · 3 winners · shows the giveaway guardrails.', simulated: true }],
      apply: (draft, id) => ({ ...draft, sample: id === 'prize' ? 'prize' : 'question' }) },
    { id: 'guard', kind: 'choice', label: 'Guardrails', when: draft => draft.sample === 'prize',
      prompt: 'Guardrails first. A prize may not seal without official rules and the Twitch disclaimer, and money never buys odds.',
      options: () => [{ id: 'clear', label: 'Attach both', tag: 'Sample', consequence: 'A SIMULATED rules template and the disclaimer. Now it may seal.' }],
      apply: draft => ({ ...draft, cleared: true }) },
    { id: 'roll', kind: 'preview', label: 'Roll', continue_label: 'Looks fair', prompt: 'Chat types !join and the roll fills on the stage.',
      lines: draft => { const draw = demoDraw(draft); return [{ label: 'Lots', value: `${lotCount(draw)} generated viewers` },
        { label: 'Winners', value: String(draw.rules.winner_count) }, { label: 'Raiders', value: 'At most 1 of 3 winners' },
        { label: 'Odds', value: 'Equal · free !join counts in full' }]; } },
    { id: 'seal', kind: 'confirm', label: 'Seal and cast', prompt: 'Hold to seal the roll. Its hash is fixed before any randomness exists; then the lots are cast and revealed.',
      note: 'SIMULATED · generated viewers and a fixed-seed rehearsal. Nothing reaches chat or OBS.',
      lines: draft => [{ label: 'Draw', value: demoDraw(draft).name }, { label: 'On stream', value: shapeNames[demoShape(draft)] },
        ...guardrailLines(demoDraw(draft)).slice(0, 1)] },
  ],
  seal: async draft => {
    const act = await actions();
    await act.sealFixtureDraw(demoDraw(draft), demoShape(draft));
    const lines = await act.castFixture('quiet');
    lower();
    return { say: 'Sealed and cast. The winners are revealed on the stage. “Prove it” recomputes them from the seal, and refuses any forged copy.',
      lines: [...lines, { label: 'Winners', value: act.fixtureWinners().join(', ') }] };
  },
});
