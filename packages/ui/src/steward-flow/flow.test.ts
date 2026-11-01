import { describe, expect, test, vi } from 'vitest';
import { answerStep, backStep, defineFlow, keepAnswer, reopenStep, resetFlow, startFlow, walkFlow } from './flow.js';
import { createDockStore } from './store.js';

type Draw = { kind: 'question' | 'prize'; winners: number; title: string; preset?: string };
const seal = vi.fn(async (draft: Draw) => ({ say: `Sealed ${draft.title}` }));
const draw = defineFlow<Draw>({
  id: 'set-up-draw', chamber: 'lottery', title: 'Set up a draw', chip: 'Set up a draw', intents: ['draw', 'giveaway'], simulated: true,
  initial: () => ({ kind: 'question', winners: 1, title: '' }),
  steps: [
    { id: 'preset', kind: 'preset', label: 'Preset', prompt: 'Start from a ready setup?',
      presets: () => [{ id: 'quick', label: 'Quick question' }, { id: 'blank', label: 'From scratch' }],
      apply: (draft, id) => id === 'quick' ? { ...draft, preset: id, title: 'Quick question' } : { ...draft, preset: id } },
    { id: 'kind', kind: 'choice', label: 'Kind', prompt: 'What kind of draw?',
      options: () => [{ id: 'question', label: 'Question', consequence: 'No prize' }, { id: 'prize', label: 'Prize' }],
      apply: (draft, id) => ({ ...draft, kind: id === 'prize' ? 'prize' : 'question' }) },
    { id: 'winners', kind: 'field', label: 'Winners', prompt: 'How many winners?', input: 'number',
      when: draft => draft.kind === 'prize',
      validate: raw => /^[1-9]\d?$/.test(raw) ? null : 'Pick 1 to 99 winners.',
      apply: (draft, raw) => ({ ...draft, winners: Number(raw) }) },
    { id: 'title', kind: 'field', label: 'Title', prompt: 'Name it', when: draft => !draft.title,
      validate: raw => raw ? null : 'Give it a name.', apply: (draft, raw) => ({ ...draft, title: raw }) },
    { id: 'look', kind: 'preview', label: 'Preview', prompt: 'This is how it reads.', lines: draft => [{ label: 'Title', value: draft.title }] },
    { id: 'seal', kind: 'confirm', label: 'Seal', prompt: 'Hold to seal.', lines: draft => [{ label: 'Winners', value: String(draft.winners) }] },
  ],
  seal,
});

function run(values: readonly string[], state = startFlow(draw)) {
  for (const value of values) {
    const result = answerStep(draw, state, value);
    if (result.error) throw new Error(result.error);
    state = result.state;
  }
  return state;
}

describe('flow runtime', () => {
  test('starts on the first visible step and skips steps whose when() is false', () => {
    const state = run(['quick', 'question']);
    const view = walkFlow(draw, state);
    expect(view.active?.step.id).toBe('look');
    expect(view.entries.map(entry => entry.step.id)).toEqual(['preset', 'kind', 'look', 'seal']);
    expect(view.draft).toEqual({ kind: 'question', winners: 1, title: 'Quick question', preset: 'quick' });
  });

  test('answered steps carry "Label · value" summaries and the live draft', () => {
    const view = walkFlow(draw, run(['blank', 'prize', '3', 'Midnight raffle']));
    expect(view.entries.filter(entry => entry.status === 'answered').map(entry => entry.summary))
      .toEqual(['Preset · From scratch', 'Kind · Prize', 'Winners · 3', 'Title · Midnight raffle']);
    expect(view.draft.winners).toBe(3);
    expect(view.position).toBe(5);
  });

  test('field validation refuses without changing state; choice refuses unknown ids', () => {
    const state = run(['blank', 'prize']);
    const refused = answerStep(draw, state, '0');
    expect(refused).toEqual({ state, error: 'Pick 1 to 99 winners.' });
    expect(answerStep(draw, startFlow(draw), 'nope').error).toBe('Choose one of the options.');
  });

  test('reopen keeps later answers, shows the old value, and re-validates them on change', () => {
    let state = run(['blank', 'prize', '3', 'Raffle', 'ok']);
    expect(walkFlow(draw, state).ready).toBe(true);
    state = reopenStep(draw, state, 'kind');
    let view = walkFlow(draw, state);
    expect(view.active?.step.id).toBe('kind');
    expect(view.active?.value).toBe('prize');
    expect(view.entries.filter(entry => entry.status === 'pending').map(entry => entry.step.id)).toContain('winners');
    expect(keepAnswer(state).editing).toBeNull();
    state = answerStep(draw, state, 'question').state;
    view = walkFlow(draw, state);
    // Winners is now skipped; the title survives, and the changed decision asks for a fresh look.
    expect(view.active?.step.id).toBe('look');
    expect(view.draft).toMatchObject({ kind: 'question', winners: 1, title: 'Raffle' });
    state = answerStep(draw, reopenStep(draw, state, 'kind'), 'prize').state;
    expect(walkFlow(draw, state).active?.step.id).toBe('look');
    expect(walkFlow(draw, state).draft.winners).toBe(3);
  });

  test('reopen ignores steps that are not answered; back walks to the previous answer', () => {
    const state = run(['blank', 'prize']);
    expect(reopenStep(draw, state, 'title')).toBe(state);
    const back = backStep(draw, state);
    expect(walkFlow(draw, back).active?.step.id).toBe('kind');
    expect(walkFlow(draw, backStep(draw, back)).active?.step.id).toBe('preset');
    expect(backStep(draw, startFlow(draw))).toEqual(startFlow(draw));
  });

  test('reset clears every answer; confirm cannot be answered', () => {
    const state = run(['quick', 'question', 'ok']);
    expect(answerStep(draw, state, 'ok').state).toBe(state);
    expect(walkFlow(draw, resetFlow(state)).active?.step.id).toBe('preset');
  });
});

describe('dock store', () => {
  test('opening raises the sheet and publishes the draft; nothing seals until seal()', async () => {
    const store = createDockStore();
    store.open(draw);
    expect(store.getSnapshot().expanded).toBe(true);
    expect(store.getSnapshot().beats.at(-1)).toMatchObject({ who: 'steward', chamber: 'lottery' });
    for (const value of ['quick', 'prize', '2']) store.answer('lottery', value);
    expect(store.getSnapshot().drafts.lottery).toMatchObject({ flow: 'set-up-draw', step: 'look', ready: false, simulated: true,
      draft: { kind: 'prize', winners: 2 } });
    await store.seal('lottery');
    expect(seal).not.toHaveBeenCalled();
    store.answer('lottery', 'ok');
    expect(store.getSnapshot().drafts.lottery?.ready).toBe(true);
    await store.seal('lottery');
    expect(seal).toHaveBeenCalledExactlyOnceWith({ kind: 'prize', winners: 2, title: 'Quick question', preset: 'quick' });
    expect(store.getSnapshot().sessions.lottery).toBeUndefined();
    expect(store.getSnapshot().drafts.lottery).toBeUndefined();
    expect(store.getSnapshot().beats.at(-1)).toMatchObject({ text: 'Sealed Quick question', sealed: true });
  });

  test('a failed seal keeps the draft open with a message; close puts it away without sealing', async () => {
    const store = createDockStore();
    const failing = { ...draw, seal: () => Promise.reject(new Error('no')) };
    store.open(failing);
    for (const value of ['quick', 'question', 'ok']) store.answer('lottery', value);
    await store.seal('lottery');
    expect(store.getSnapshot().sessions.lottery?.error).toMatch(/Nothing changed/);
    expect(store.getSnapshot().sessions.lottery?.state.status).toBe('open');
    store.close('lottery');
    expect(store.getSnapshot().sessions.lottery).toBeUndefined();
    expect(store.getSnapshot().beats.at(-1)?.text).toMatch(/Nothing was sealed/);
  });

  test('field errors are kept on the session until the next answer', () => {
    const store = createDockStore();
    store.open(draw);
    for (const value of ['blank', 'prize', 'zero']) store.answer('lottery', value);
    expect(store.getSnapshot().sessions.lottery?.error).toBe('Pick 1 to 99 winners.');
    store.answer('lottery', '4');
    expect(store.getSnapshot().sessions.lottery?.error).toBeUndefined();
    store.collapse();
    expect(store.getSnapshot().expanded).toBe(false);
    store.open(draw);
    expect(store.getSnapshot().drafts.lottery?.draft).toMatchObject({ winners: 4 });
  });
});
