import type { ReactNode } from 'react';

/**
 * Steward flows: small scripted conversations that build a draft one decision
 * at a time and act only on the final hold to seal. Pure logic, no React state:
 * a FlowState is a list of answers, and every view of it is replayed from the
 * flow's initial draft, so back, reopen and reset can never desynchronise.
 *
 * Step methods use method syntax on purpose: it keeps StewardFlow<Draft>
 * assignable to AnyStewardFlow for the registry without casts.
 */
export type FlowChamber = 'keep' | 'lottery' | 'moderator' | 'visuals' | 'studio' | 'stream' | 'rehearsal';
export const flowChambers: readonly FlowChamber[] = ['keep', 'lottery', 'moderator', 'visuals', 'studio', 'stream', 'rehearsal'];

export type FlowLine = { label: string; value: string };
/** One option on a choice or preset card. `consequence` is the one line under it. */
export type FlowOption = { id: string; label: string; consequence?: string; tag?: string; simulated?: boolean;
  /** A small picture on the card (a library thumbnail). */
  picture?: { src: string; alt: string };
  /** Shown but not choosable; `consequence` says why. */
  disabled?: boolean };

type StepBase<D> = {
  id: string;
  /** Short noun for the answered summary chip ("Winners" in "Winners · 3"). */
  label: string;
  /** The Steward's line above the card, set in the book font. */
  prompt: string;
  /** The line for this draft when it depends on earlier answers (a follow-up question); defaults to `prompt`. */
  ask?(draft: D): string;
  /** Skip the step for this draft. Evaluated against the draft built so far. */
  when?(draft: D): boolean;
};
export type ChoiceStep<D> = StepBase<D> & {
  kind: 'choice';
  options(draft: D): readonly FlowOption[];
  apply(draft: D, id: string): D;
  /** Value half of the summary chip; defaults to the option label. */
  summary?(draft: D, id: string): string;
};
export type PresetStep<D> = StepBase<D> & {
  kind: 'preset';
  presets(draft: D): readonly FlowOption[];
  apply(draft: D, id: string): D;
  summary?(draft: D, id: string): string;
};
export type FieldStep<D> = StepBase<D> & {
  kind: 'field';
  input?: 'text' | 'number';
  placeholder?: string;
  hint?: string;
  initial?(draft: D): string;
  /** Return a short message to refuse the value, or null to accept it. */
  validate?(raw: string, draft: D): string | null;
  apply(draft: D, raw: string): D;
  summary?(draft: D, raw: string): string;
  /** Quick answers under the input; choosing one submits it as typed text. */
  suggestions?(draft: D): readonly string[];
};
export type PreviewStep<D> = StepBase<D> & {
  kind: 'preview';
  lines?(draft: D): readonly FlowLine[];
  /** Optional mini picture of the draft inside the card. */
  render?(draft: D): ReactNode;
  continue_label?: string;
  /** Extra buttons that reopen an earlier step ("Try again" reopens the work, "Adjust" a question). */
  actions?(draft: D): readonly { label: string; step: string }[];
};
/** What a running work step may do while it runs. */
export type WorkContext = {
  /** Aborted when the streamer cancels or the flow closes; a late result is then dropped. */
  signal: AbortSignal;
  /** Replace the progress line under the card ("Generating the image..."). */
  progress(text: string): void;
};
/**
 * An async step: it runs on its own as soon as it becomes active, shows progress with a
 * cancel, and its resolved string becomes the step's answer (a failure is shown inline with
 * a retry). The flow owns the meaning of the string, e.g. a key into its own result cache.
 */
export type WorkStep<D> = StepBase<D> & {
  kind: 'work';
  run(draft: D, context: WorkContext): Promise<string>;
  /** Whether a stored answer still belongs to this draft; false runs the work again. Defaults to true. */
  accepts?(draft: D, value: string): boolean;
  apply(draft: D, value: string): D;
  summary?(draft: D, value: string): string;
  /** One quiet line under the progress, e.g. "Uses your OpenAI key." */
  note?(draft: D): string | undefined;
};
export type ConfirmStep<D> = StepBase<D> & {
  kind: 'confirm';
  lines(draft: D): readonly FlowLine[];
  /** One line under the summary, e.g. "Nothing reaches chat until you hold." */
  note?: string;
};
export type FlowStep<D> = ChoiceStep<D> | PresetStep<D> | FieldStep<D> | PreviewStep<D> | ConfirmStep<D> | WorkStep<D>;
export type FlowStepKind = FlowStep<unknown>['kind'];

/** A chip the closing beat offers (structurally a registry StewardChip; kept local to avoid a cycle). */
export type OutcomeChip = { label: string; action: { kind: 'flow'; chamber: FlowChamber; flow: string } | { kind: 'demo' | 'catch_up' | 'go'; chamber: FlowChamber } };
/** `chips` offer the next flow on the receipt beat ("Set up a real draw"); they only open flows, never act. */
export type SealOutcome = { say: string; lines?: readonly FlowLine[]; chips?: readonly OutcomeChip[] };

export type StewardFlow<D> = {
  id: string;
  chamber: FlowChamber;
  title: string;
  /** Quick-chip label in the collapsed dock; flows without one open from text only. */
  chip?: string;
  /** The Steward's opening line for the flow. */
  intro?: string;
  /** Phrases the free-text matcher maps to this flow ("draw", "giveaway"). */
  intents?: readonly string[];
  /** Demo and fixture flows: SIMULATED stays on the sheet and the confirm card. */
  simulated?: boolean;
  initial(): D;
  steps: readonly FlowStep<D>[];
  /** Runs only from the confirm card's hold to seal, never from text. */
  seal(draft: D): SealOutcome | Promise<SealOutcome>;
};
export type AnyStewardFlow = StewardFlow<unknown>;

/** Identity helper that lets TypeScript infer the draft type of a flow literal. */
export function defineFlow<D>(flow: StewardFlow<D>): StewardFlow<D> { return flow; }

export type FlowAnswer = { step: string; value: string };
export type FlowStatus = 'open' | 'sealing' | 'sealed';
export type FlowState = {
  flow: string;
  answers: readonly FlowAnswer[];
  /** An answered step reopened from its summary chip. */
  editing: string | null;
  status: FlowStatus;
};

export type FlowEntry<D> = {
  step: FlowStep<D>;
  status: 'answered' | 'active' | 'pending';
  value?: string;
  /** "Label · value" for answered steps. */
  summary?: string;
  /** Draft before this step was applied: what the step's card is drawn against. */
  before: D;
};
export type FlowView<D> = {
  entries: readonly FlowEntry<D>[];
  active: FlowEntry<D> | null;
  /** The live draft for the chamber picture. */
  draft: D;
  /** The active step is the confirm card. */
  ready: boolean;
  /** 1-based position of the active step among visible steps, and the visible count so far. */
  position: number;
  total: number;
  /** Steps the draft is expected to walk in all: visible ones plus pending ones whose `when` holds now. */
  planned: number;
};

export function startFlow(flow: { id: string }): FlowState {
  return { flow: flow.id, answers: [], editing: null, status: 'open' };
}

function accepts<D>(step: FlowStep<D>, draft: D, value: string): boolean {
  switch (step.kind) {
    case 'choice': return step.options(draft).some(option => option.id === value && !option.disabled);
    case 'preset': return step.presets(draft).some(option => option.id === value && !option.disabled);
    case 'field': return !step.validate || step.validate(value, draft) === null;
    case 'work': return step.accepts?.(draft, value) ?? true;
    case 'preview': return true;
    case 'confirm': return false;
  }
}

function applyStep<D>(step: FlowStep<D>, draft: D, value: string): D {
  switch (step.kind) {
    case 'choice': case 'preset': case 'field': case 'work': return step.apply(draft, value);
    case 'preview': case 'confirm': return draft;
  }
}

export function summarize<D>(step: FlowStep<D>, before: D, value: string): string {
  const after = applyStep(step, before, value);
  switch (step.kind) {
    case 'choice': return `${step.label} · ${step.summary?.(after, value) ?? step.options(before).find(option => option.id === value)?.label ?? value}`;
    case 'preset': return `${step.label} · ${step.summary?.(after, value) ?? step.presets(before).find(option => option.id === value)?.label ?? value}`;
    case 'field': return `${step.label} · ${step.summary?.(after, value) ?? value}`;
    case 'work': return `${step.label} · ${step.summary?.(after, value) ?? 'done'}`;
    case 'preview': return `${step.label} · looked over`;
    case 'confirm': return step.label;
  }
}

/** Replay the answers over the flow. Stale answers (now invalid or skipped) are ignored, not deleted. */
export function walkFlow<D>(flow: StewardFlow<D>, state: FlowState): FlowView<D> {
  const entries: FlowEntry<D>[] = [];
  let draft = flow.initial();
  let active: FlowEntry<D> | null = null;
  for (const step of flow.steps) {
    if (active) { entries.push({ step, status: 'pending', before: draft }); continue; }
    if (step.when && !step.when(draft)) continue;
    const answer = state.answers.find(item => item.step === step.id);
    const valid = answer !== undefined && accepts(step, draft, answer.value);
    if (valid && state.editing !== step.id) {
      entries.push({ step, status: 'answered', value: answer.value, summary: summarize(step, draft, answer.value), before: draft });
      draft = applyStep(step, draft, answer.value);
      continue;
    }
    active = { step, status: 'active', before: draft, ...(valid ? { value: answer.value } : {}) };
    entries.push(active);
    // A reopened step keeps showing its old answer in the picture until it is changed.
    if (valid) draft = applyStep(step, draft, answer.value);
  }
  const visible = entries.filter(entry => entry.status !== 'pending');
  const planned = visible.length + entries.filter(entry => entry.status === 'pending' && (!entry.step.when || entry.step.when(draft))).length;
  return { entries, active, draft, ready: active?.step.kind === 'confirm',
    position: active ? visible.indexOf(active) + 1 : visible.length, total: visible.length, planned };
}

export type AnswerResult = { state: FlowState; error?: string };

/** Answer the active step. A field's refusal comes back as `error` and the state is unchanged. */
export function answerStep<D>(flow: StewardFlow<D>, state: FlowState, value: string): AnswerResult {
  if (state.status !== 'open') return { state };
  const { active } = walkFlow(flow, state);
  if (!active || active.step.kind === 'confirm') return { state };
  const step = active.step;
  if (step.kind === 'field') {
    const error = step.validate?.(value, active.before) ?? null;
    if (error !== null) return { state, error };
  } else if (!accepts(step, active.before, value)) return { state, error: 'Choose one of the options.' };
  // A changed decision invalidates every "looks right": the streamer sees the new preview again.
  const changed = active.value !== undefined && active.value !== value;
  const previews = new Set(flow.steps.filter(item => item.kind === 'preview').map(item => item.id));
  const answers = [...state.answers.filter(item => item.step !== step.id && !(changed && previews.has(item.step))), { step: step.id, value }];
  return { state: { ...state, answers, editing: null } };
}

/** Reopen an answered step from its summary chip. */
export function reopenStep<D>(flow: StewardFlow<D>, state: FlowState, step_id: string): FlowState {
  if (state.status !== 'open') return state;
  const entry = walkFlow(flow, { ...state, editing: null }).entries.find(item => item.step.id === step_id);
  return entry?.status === 'answered' ? { ...state, editing: step_id } : state;
}

/** Step back: reopen the answered step just before the active one. Work steps are stepped over,
 * so Back never runs (and never spends on) a finished piece of work again. */
export function backStep<D>(flow: StewardFlow<D>, state: FlowState): FlowState {
  if (state.status !== 'open') return state;
  const { entries, active } = walkFlow(flow, state);
  const answered = entries.filter(entry => entry.status === 'answered' && entry.step.kind !== 'work');
  const index = active ? entries.indexOf(active) : entries.length;
  const previous = answered.filter(entry => entries.indexOf(entry) < index).at(-1);
  return previous ? { ...state, editing: previous.step.id } : state;
}

/** Cancel a reopen without changing the answer. */
export function keepAnswer(state: FlowState): FlowState {
  return state.editing === null ? state : { ...state, editing: null };
}

export function resetFlow(state: FlowState): FlowState {
  return { flow: state.flow, answers: [], editing: null, status: 'open' };
}
