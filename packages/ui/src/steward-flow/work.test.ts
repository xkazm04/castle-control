import { describe, expect, test, vi } from 'vitest';
import { answerStep, backStep, defineFlow, reopenStep, startFlow, walkFlow } from './flow.js';
import type { WorkContext } from './flow.js';
import { createDockStore } from './store.js';

type Draft = { size?: string; result?: string };
type Deferred = { resolve(value: string): void; reject(error: Error): void; context: WorkContext; draft: Draft };

function harness() {
  const runs: Deferred[] = [];
  const seal = vi.fn(async (draft: Draft) => ({ say: `Sealed ${draft.result ?? ''}` }));
  const flow = defineFlow<Draft>({
    id: 'make', chamber: 'visuals', title: 'Make a thing', initial: () => ({}),
    steps: [
      { id: 'size', kind: 'choice', label: 'Size', prompt: 'Which size?',
        options: () => [{ id: 'small', label: 'Small' }, { id: 'large', label: 'Large' }, { id: 'huge', label: 'Huge', disabled: true }],
        apply: (draft, id) => ({ ...draft, size: id }) },
      { id: 'make', kind: 'work', label: 'Made', prompt: 'Making it...', note: () => 'Uses your own key.',
        run: (draft, context) => new Promise<string>((resolve, reject) => { runs.push({ resolve, reject, context, draft }); }),
        // A stored result belongs to the size it was made for.
        accepts: (draft, value) => value.startsWith(`${draft.size ?? ''}:`),
        apply: (draft, value) => ({ ...draft, result: value }), summary: draft => draft.result ?? '' },
      { id: 'look', kind: 'preview', label: 'Preview', prompt: 'Here it is.', actions: () => [{ label: 'Try again', step: 'make' }] },
      { id: 'seal', kind: 'confirm', label: 'Seal', prompt: 'Hold.', lines: draft => [{ label: 'Result', value: draft.result ?? '' }] },
    ],
    seal,
  });
  return { flow, runs, seal, store: createDockStore() };
}
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('work steps in the pure runtime', () => {
  test('a work answer is kept while it still accepts the draft; Back steps over it', () => {
    const { flow } = harness();
    let state = answerStep(flow, startFlow(flow), 'small').state;
    expect(walkFlow(flow, state).active?.step.kind).toBe('work');
    state = answerStep(flow, state, 'small:1').state;
    const view = walkFlow(flow, state);
    expect(view.active?.step.id).toBe('look');
    expect(view.entries[1]?.summary).toBe('Made · small:1');
    // Back from the preview reopens the size, never the paid work.
    expect(walkFlow(flow, backStep(flow, state)).active?.step.id).toBe('size');
    // A changed size invalidates the stored work, which becomes active again.
    state = answerStep(flow, reopenStep(flow, state, 'size'), 'large').state;
    expect(walkFlow(flow, state).active?.step.id).toBe('make');
    expect(answerStep(flow, state, 'small:2').error).toBe('Choose one of the options.');
  });

  test('disabled options cannot be chosen', () => {
    const { flow } = harness();
    expect(answerStep(flow, startFlow(flow), 'huge').error).toBe('Choose one of the options.');
  });
});

describe('work steps in the dock store', () => {
  test('runs when active, publishes progress, and stores the result as the answer', async () => {
    const { flow, runs, store } = harness();
    store.open(flow);
    expect(runs).toHaveLength(0);
    store.answer('visuals', 'small');
    expect(runs).toHaveLength(1);
    expect(runs[0]?.draft).toEqual({ size: 'small' });
    expect(store.getSnapshot().sessions.visuals?.work).toEqual({ step: 'make', status: 'running', progress: 'Making it...' });
    runs[0]?.context.progress('Half way');
    expect(store.getSnapshot().sessions.visuals?.work?.progress).toBe('Half way');
    runs[0]?.resolve('small:1');
    await flush();
    expect(store.getSnapshot().sessions.visuals?.work).toBeUndefined();
    expect(store.getSnapshot().drafts.visuals).toMatchObject({ step: 'look', draft: { size: 'small', result: 'small:1' } });
    // A no-op keep never restarts anything.
    store.keep('visuals');
    expect(runs).toHaveLength(1);
  });

  test('a failure shows inline and waits; retry runs once more', async () => {
    const { flow, runs, store } = harness();
    store.open(flow);
    store.answer('visuals', 'small');
    runs[0]?.reject(new Error('The provider refused the request. Nothing was spent.'));
    await flush();
    expect(store.getSnapshot().sessions.visuals?.work).toEqual({ step: 'make', status: 'failed', progress: '',
      error: 'The provider refused the request. Nothing was spent.' });
    store.answer('visuals', 'small');
    expect(runs).toHaveLength(1);
    store.retry('visuals');
    expect(runs).toHaveLength(2);
    runs[1]?.resolve('small:2');
    await flush();
    expect(store.getSnapshot().drafts.visuals?.step).toBe('look');
  });

  test('cancel aborts, drops the late result and reopens the step before', async () => {
    const { flow, runs, store } = harness();
    store.open(flow);
    store.answer('visuals', 'small');
    const signal = runs[0]?.context.signal;
    store.cancel('visuals');
    expect(signal?.aborted).toBe(true);
    expect(store.getSnapshot().drafts.visuals?.step).toBe('size');
    runs[0]?.resolve('small:1');
    await flush();
    expect(store.getSnapshot().drafts.visuals?.draft).toEqual({ size: 'small' });
  });

  test('Try again reruns the work; cancelling it keeps the earlier result', async () => {
    const { flow, runs, store } = harness();
    store.open(flow);
    store.answer('visuals', 'small');
    runs[0]?.resolve('small:1');
    await flush();
    store.reopen('visuals', 'make');
    expect(runs).toHaveLength(2);
    store.cancel('visuals');
    expect(store.getSnapshot().drafts.visuals).toMatchObject({ step: 'look', draft: { result: 'small:1' } });
    store.reopen('visuals', 'make');
    runs[2]?.resolve('small:3');
    await flush();
    store.answer('visuals', 'ok');
    await store.seal('visuals');
    expect(store.getSnapshot().beats.at(-1)?.text).toBe('Sealed small:3');
  });

  test('closing the flow aborts its work; a failure without a message gets a plain one', async () => {
    const { flow, runs, store } = harness();
    store.open(flow);
    store.answer('visuals', 'small');
    store.close('visuals');
    expect(runs[0]?.context.signal.aborted).toBe(true);
    const failing = { ...flow, id: 'other', steps: flow.steps.map(step => step.kind === 'work'
      ? { ...step, run: () => Promise.reject(new Error('')) } : step) };
    store.open(failing);
    store.answer('visuals', 'small');
    await flush();
    expect(store.getSnapshot().sessions.visuals?.work?.error).toBe('That did not work. Nothing was sealed.');
  });
});
