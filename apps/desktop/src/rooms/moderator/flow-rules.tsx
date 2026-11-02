import type { Action, ChatDelay, Rule } from '@castle-control/contract';
import { proposalQueue } from '@castle-control/ui/steward';
import { defineFlow } from '@castle-control/ui/steward-flow';
import type { FlowLine } from '@castle-control/ui/steward-flow';
import { evaluateDraft } from '../../moderation-bench.js';
import { moderationSession, sealCommand } from './session.js';

/** "Set the rules": preset rule set -> strictness -> held vs barred -> sample preview -> seal. */
type PresetId = 'family' | 'open' | 'tournament';
type BarredId = 'hold_all' | 'bar_blocked' | 'bar_blocked_repeats';
export type RulesDraft = { preset?: PresetId; delay?: ChatDelay; barred?: BarredId };

const presets: readonly { id: PresetId; label: string; consequence: string; add?: { name: string; pattern: string; action: Action } }[] = [
  { id: 'family', label: 'Family evening', consequence: 'The three gate rules, plus a watching rule for link questions.',
    add: { name: 'Link questions', pattern: 'share a link', action: 'delete' } },
  { id: 'open', label: 'Open chat', consequence: 'The three gate rules as they stand. Nothing new is watched.' },
  { id: 'tournament', label: 'Tournament night', consequence: 'Adds a watching rule for “go left” backseating spam.',
    add: { name: 'Backseating', pattern: 'go left', action: 'delete' } },
];
const delays: readonly { value: ChatDelay; label: string; consequence: string }[] = [
  { value: 0, label: 'Gentle', consequence: 'No chat delay: lines show at once, you review after.' },
  { value: 2, label: 'Steady', consequence: 'Chat waits 2 s at the moat.' },
  { value: 4, label: 'Watchful', consequence: 'Chat waits 4 s: time for the gate to hold a line.' },
  { value: 6, label: 'Siege', consequence: 'Chat waits 6 s, the longest the moat allows.' },
];
const barredSets: readonly { id: BarredId; label: string; consequence: string; armed: readonly string[] }[] = [
  { id: 'hold_all', label: 'Hold everything for me', consequence: 'Every rule watches and holds; nothing acts without you.', armed: [] },
  { id: 'bar_blocked', label: 'Bar blocked terms, hold the rest', consequence: 'Blocked terms are marked Armed; links and repeats wait for you.', armed: ['blocked-terms'] },
  { id: 'bar_blocked_repeats', label: 'Bar blocked terms and repeats', consequence: 'Two rules marked Armed; links still wait for you.', armed: ['blocked-terms', 'repeats'] },
];
export const armedNote = 'Armed is a preview label tonight: actual rules stay Watching until the live spike.';

const session = () => moderationSession(proposalQueue);
const sample = () => session().port.getSnapshot().messages.slice(0, 420);
const presetOf = (draft: RulesDraft) => presets.find(item => item.id === draft.preset);
const delayName = (value: ChatDelay | undefined) => delays.find(item => item.value === value);

export type RuleFate = { rule_id: string; name: string; armed: boolean; hits: number; added: boolean };
/** Each rule's fate under the draft, counted over the 420 SIMULATED sample lines. */
export function ruleFates(draft: RulesDraft): RuleFate[] {
  const state = session().port.getSnapshot();
  const messages = sample();
  const armed = barredSets.find(item => item.id === draft.barred)?.armed;
  const fates = state.rules.filter(rule => rule.rule_class === 'pattern').map((rule: Rule): RuleFate => {
    const result = evaluateDraft({ name: rule.name, pattern: rule.pattern ?? '', action: rule.action }, state.rules, messages, rule);
    return { rule_id: rule.rule_id, name: rule.name, armed: armed ? armed.includes(rule.rule_id) : state.preview_modes.get(rule.rule_id) === 'armed',
      hits: result.total_hits, added: false };
  });
  const add = presetOf(draft)?.add;
  if (add && !state.rules.some(rule => rule.name === add.name)) {
    const result = evaluateDraft(add, state.rules, messages);
    fates.push({ rule_id: result.ok ? result.rule.rule_id : add.name, name: add.name, armed: false, hits: result.total_hits, added: true });
  }
  return fates;
}

/** The chamber picture and the preview card share this: the draft's rules against sample chat. */
export function RulesPicture({ draft }: { draft: RulesDraft }) {
  const fates = ruleFates(draft);
  const delay = draft.delay ?? session().port.getSnapshot().delay.value;
  return <div className="gh-rules-picture">
    <p className="gh-rules-picture__head"><span className="cc-stamp cc-stamp--draft">Draft</span>
      <b>{presetOf(draft)?.label ?? 'Current rules'}</b><span>chat waits {delay ? `${delay} s` : 'not at all'} · counted on 420 simulated lines</span></p>
    <ul className="gh-fates">{fates.map(fate => <li key={fate.rule_id} data-armed={fate.armed}>
      <span className="gh-fates__name">{fate.name}{fate.added && <em> · new, watching</em>}</span>
      <span className={`cc-stamp cc-stamp--inked ${fate.armed ? 'cc-stamp--blocked' : 'cc-stamp--held'}`}>{fate.armed ? 'Barred' : 'Held for you'}</span>
      <b>{fate.hits}</b><small>hits</small></li>)}</ul>
    <p className="gh-sm">{armedNote}</p>
  </div>;
}

export function rulesLines(draft: RulesDraft): FlowLine[] {
  const fates = ruleFates(draft);
  return [
    { label: 'Rule set', value: presetOf(draft)?.label ?? 'Not chosen' },
    { label: 'Chat delay', value: draft.delay === undefined ? 'Not chosen' : `${delayName(draft.delay)?.label ?? ''} · ${draft.delay ? `${draft.delay} s` : 'off'}` },
    { label: 'Barred', value: fates.filter(fate => fate.armed).map(fate => fate.name).join(', ') || 'Nothing: all held for you' },
    { label: 'Held for you', value: fates.filter(fate => !fate.armed).map(fate => fate.name).join(', ') || 'Nothing' },
  ];
}

/** One line for the gate while the flow is open. */
export function rulesRibbon(draft: RulesDraft): string {
  const barred = ruleFates(draft).filter(fate => fate.armed).map(fate => fate.name);
  return ['Set the rules', presetOf(draft)?.label, draft.delay === undefined ? undefined : `chat waits ${draft.delay ? `${draft.delay} s` : 'not at all'}`,
    draft.barred ? (barred.length ? `${barred.join(' and ')} barred` : 'everything held for you') : undefined].filter(Boolean).join(' · ');
}

export const rulesFlow = defineFlow<RulesDraft>({
  id: 'gatehouse-rules', chamber: 'moderator', title: 'Set the rules', chip: 'Set the rules', simulated: true,
  intents: ['rules', 'set the rules', 'strict', 'strictness', 'automod', 'block words', 'filter chat', 'chat delay', 'moat'],
  intro: 'Let us set the gate: a rule set, how strict, what is barred, then a look at sample chat. Nothing acts until you hold to seal.',
  initial: () => ({}),
  steps: [
    { id: 'preset', kind: 'preset', label: 'Rule set', prompt: 'Start from a rule set. You tune it in the next steps.',
      presets: () => presets.map(item => ({ id: item.id, label: item.label, consequence: item.consequence })),
      apply: (draft, id) => { const preset = presets.find(item => item.id === id)?.id; return preset ? { ...draft, preset } : draft; } },
    { id: 'strictness', kind: 'choice', label: 'Strictness', prompt: 'How strict tonight? This is how long chat waits at the moat.',
      options: () => {
        const now = session().port.getSnapshot().delay.value;
        return delays.map(item => ({ id: String(item.value), label: item.label, consequence: item.consequence, ...(item.value === now ? { tag: 'now' } : {}) }));
      },
      apply: (draft, id) => { const delay = delays.find(item => String(item.value) === id)?.value; return delay === undefined ? draft : { ...draft, delay }; } },
    { id: 'barred', kind: 'choice', label: 'Barred', prompt: 'What is barred outright, and what is held for you?',
      options: () => barredSets.map(item => ({ id: item.id, label: item.label, consequence: item.consequence })),
      apply: (draft, id) => { const barred = barredSets.find(item => item.id === id)?.id; return barred ? { ...draft, barred } : draft; } },
    { id: 'sample', kind: 'preview', label: 'Sample', prompt: 'Here is the draft against 420 simulated sample lines. The gate above shows the same.',
      render: draft => <RulesPicture draft={draft} /> },
    { id: 'seal', kind: 'confirm', label: 'Seal', prompt: 'Hold to seal the rules.', lines: rulesLines,
      note: 'SIMULATED fixture session. Rules stay Watching; nothing reaches Twitch.' },
  ],
  seal: draft => {
    const queue = proposalQueue;
    const { port } = session();
    const done: string[] = [];
    const add = presetOf(draft)?.add;
    const fates = ruleFates(draft);
    const before = port.getSnapshot();
    if (add && !before.rules.some(rule => rule.name === add.name)) {
      const result = evaluateDraft(add, before.rules, sample());
      if (!result.ok) throw new Error('The preset rule did not validate.');
      sealCommand(queue, { kind: 'rule', rule: result.rule }, `Add watching rule ${add.name}`);
      done.push(`added ${add.name}`);
    }
    for (const fate of fates) {
      const state = port.getSnapshot();
      const rule = state.rules.find(item => item.rule_id === fate.rule_id || item.name === fate.name);
      if (!rule) continue;
      const mode = fate.armed ? 'armed' : 'shadow';
      if ((state.preview_modes.get(rule.rule_id) ?? 'shadow') === mode) continue;
      sealCommand(queue, { kind: 'mode', rule_id: rule.rule_id, mode }, `${mode === 'armed' ? 'Arm' : 'Watch'} ${rule.name}`);
      done.push(`${rule.name} ${mode === 'armed' ? 'barred' : 'held for you'}`);
    }
    const now = port.getSnapshot().delay;
    if (draft.delay !== undefined && now.kind === 'applied' && now.value !== draft.delay) {
      sealCommand(queue, { kind: 'delay', delay_s: draft.delay }, `Set chat delay to ${draft.delay} s`);
      done.push(`chat delay ${draft.delay} s`);
    }
    return { say: done.length ? `Sealed: ${done.join(', ')}. ${armedNote}` : 'Sealed. The gate already matched this draft; nothing changed.',
      lines: rulesLines(draft) };
  },
});
