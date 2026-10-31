import { afterEach, expect, test, vi } from 'vitest';
import { createSteward, LiveSteward } from './live.js';
import { ProposalQueue } from './queue.js';
import { SimulatedSteward } from './simulated.js';
import { RecordedStewardTransport, recordedWrits, reply } from './fixtures/recorded.js';
import type { StewardContext } from './port.js';

const context: StewardContext = { surface: 'room', chamber: 'lottery' };
const draw = recordedWrits[0];
afterEach(() => { vi.unstubAllGlobals(); });

test.each(recordedWrits)('maps simulated $proposal.method into a draft only', async writ => {
  const queue = new ProposalQueue();
  const transport = new RecordedStewardTransport([reply(writ)]);
  const steward = new LiveSteward(transport, queue);
  const chamber = writ.chamber === 'lots' ? 'lottery' : writ.chamber === 'gatehouse' ? 'moderator' : 'visuals';
  const turn = await steward.ask('Simulated: draft this configuration', { surface: 'room', chamber });
  expect(turn.proposals).toHaveLength(1);
  expect(turn.proposals[0]).toMatchObject({ id: writ.writ_id, chamber, revision: 1, state: 'drafted',
    kind: chamber === 'visuals' ? 'proclaim' : 'seal' });
  expect(turn.proposals[0]).not.toHaveProperty('seal_hash');
  expect(turn.proposals[0]?.fields.find(field => field.key === 'after')?.value).toContain(
    Object.keys(writ.proposal.diff.after)[0] ?? 'missing fixture field');
  expect(queue.pending()).toEqual(turn.proposals);
  expect(transport.calls.map(call => call.method)).toEqual(['steward.ask']);
  expect(turn.reply).toMatch(/hold/i);
});

test('amend re-inks one shared draft and tearUp discards it through the contract', async () => {
  const queue = new ProposalQueue();
  const amended = { ...draw, updated_at: '2026-10-27T00:00:02Z', proposal: { ...draw.proposal,
    diff: { after: { draw: { ...draw.proposal.diff.after.draw,
      rules: { ...draw.proposal.diff.after.draw.rules, winner_count: 5 } } } } } };
  const transport = new RecordedStewardTransport([reply(draw), reply(amended), reply({ ...amended, status: 'torn' })]);
  const steward = new LiveSteward(transport, queue);
  const draft = (await steward.ask('Simulated: draft questions', context)).proposals[0];
  if (!draft) throw new Error('Expected fixture draft');
  const old = draft.fields.find(field => field.key === 'after')?.value;
  const next = await steward.amend(draft.id, 'Simulated: make it 5 winners', context);
  expect(next.proposals[0]).toMatchObject({ id: draft.id, revision: 2, state: 'amended' });
  expect(next.proposals[0]?.fields.find(field => field.key === 'after')).toMatchObject({ struck: [old] });
  expect(queue.pending()).toHaveLength(1);
  expect(transport.calls[1]).toEqual({ method: 'steward.ask', params: {
    chamber: 'lots', prompt: 'Simulated: make it 5 winners', writ_id: draft.id,
  } });
  expect((await steward.tearUp(draft.id)).proposals[0]?.state).toBe('torn');
  expect(queue.pending()).toEqual([]);
  expect(transport.calls.map(call => call.method)).toEqual(['steward.ask', 'steward.ask', 'steward.writ.tear']);
});

const failures = [
  { label: 'broken JSON', value: '{' },
  { label: 'null', value: '{"writ":null}' },
  { label: 'unknown field', value: reply({ ...draw, extra: true }) },
  { label: 'invalid typed configuration', value: reply({ ...draw, proposal: { method: 'lots.draw.upsert', diff: { after: {} } } }) },
  { label: 'sealed', value: reply({ ...draw, status: 'sealed' }) },
  { label: 'torn', value: reply({ ...draw, status: 'torn' }) },
  { label: 'invalid', value: reply({ ...draw, status: 'invalid' }) },
  { label: 'error attached', value: reply({ ...draw, error: { code: 'upstream', message: 'Simulated failure' } }) },
  { label: 'chamber mismatch', value: reply(recordedWrits[1]) },
  { label: 'transport failure', value: new Error('Simulated unavailable transport') },
];

test.each(failures)('ask rejects $label without touching any queue state', async ({ value }) => {
  const queue = new ProposalQueue();
  await new SimulatedSteward(queue).ask('draft a question draw', context);
  const before = queue.getSnapshot();
  const steward = new LiveSteward(new RecordedStewardTransport([value]), queue);
  const turn = await steward.ask('Simulated: draft questions', context);
  expect(turn.proposals).toEqual([]);
  expect(turn.reply).toContain('No authorization was given');
  expect(queue.getSnapshot()).toBe(before);
});

test.each(['amend', 'tearUp'] as const)('%s leaves a valid existing draft intact after malformed/failing replies', async operation => {
  const invalid = failures.filter(row => operation !== 'tearUp' || row.label !== 'torn');
  for (const value of [...invalid.map(row => row.value), reply({ ...draw, writ_id: '01ARZ3NDEKTSV4RRFFQ69G5FAW' })]) {
    const queue = new ProposalQueue();
    const transport = new RecordedStewardTransport([reply(draw), value]);
    const steward = new LiveSteward(transport, queue);
    await steward.ask('Simulated: draft questions', context);
    const before = queue.getSnapshot();
    const turn = operation === 'amend' ? await steward.amend(draw.writ_id, 'Simulated amendment', context)
      : await steward.tearUp(draw.writ_id);
    expect(turn.proposals).toEqual([]);
    expect(turn.reply).toContain('No authorization was given');
    expect(queue.getSnapshot()).toBe(before);
  }
});

test('factory defaults to simulated and requires explicit true and an injected transport', () => {
  expect(createSteward()).toBeInstanceOf(SimulatedSteward);
  const transport = new RecordedStewardTransport([]);
  expect(createSteward({ transport })).toBeInstanceOf(SimulatedSteward);
  expect(createSteward({ live: false, transport })).toBeInstanceOf(SimulatedSteward);
  expect(createSteward({ live: true, transport })).toBeInstanceOf(LiveSteward);
  expect(createSteward({ live: true })).toBeInstanceOf(SimulatedSteward);
  expect(transport.calls).toEqual([]);
});

test('an opted-in adapter seals only on an explicit call and validates the seal round trip', async () => {
  const queue = new ProposalQueue();
  const transport = new RecordedStewardTransport([reply(draw)]);
  const seal = vi.spyOn(transport, 'seal').mockResolvedValue(reply({ ...draw, status: 'sealed' }));
  const steward = createSteward({ live: true, transport, queue });
  expect(steward).toBeInstanceOf(LiveSteward);
  if (!(steward instanceof LiveSteward)) throw new Error('Expected live adapter');
  await steward.ask('Draft questions', context);
  expect(seal).not.toHaveBeenCalled();
  expect(queue.pending()).toHaveLength(1);
  expect((await steward.seal(draw.writ_id)).proposals[0]?.state).toBe('sealed');
  expect(seal).toHaveBeenCalledExactlyOnceWith({ writ_id: draw.writ_id });
  expect(queue.pending()).toHaveLength(0);
  await steward.seal(draw.writ_id);
  expect(seal).toHaveBeenCalledTimes(1);
});

test.each(['{', reply({ ...draw, status: 'proposed' }), reply({ ...draw, status: 'sealed', simulated: true }),
  reply({ ...draw, status: 'sealed', proposal: recordedWrits[1].proposal })])(
  'a malformed or changed seal reply cannot mark the local draft applied', async response => {
    const queue = new ProposalQueue();
    const transport = new RecordedStewardTransport([reply(draw)]);
    vi.spyOn(transport, 'seal').mockResolvedValue(response);
    const steward = new LiveSteward(transport, queue);
    await steward.ask('Draft questions', context);
    const before = queue.getSnapshot();
    expect((await steward.seal(draw.writ_id)).proposals).toEqual([]);
    expect(queue.getSnapshot()).toBe(before);
  });

test('missing, unsupported and foreign selections fail before transport; terminal drafts cannot be amended', async () => {
  const queue = new ProposalQueue();
  const transport = new RecordedStewardTransport([reply(draw)]);
  const steward = new LiveSteward(transport, queue);
  const before = queue.getSnapshot();
  for (const ctx of [{ surface: 'keep' }, { surface: 'room', chamber: 'studio' },
    { ...context, selected_proposal_id: 'missing' }] as const) {
    expect((await steward.ask('Simulated request', ctx)).proposals).toEqual([]);
  }
  expect((await steward.ask(' ', context)).proposals).toEqual([]);
  expect((await steward.amend('missing', 'Simulated amendment', context)).proposals).toEqual([]);
  expect((await steward.tearUp('missing')).proposals).toEqual([]);
  expect(queue.getSnapshot()).toBe(before);
  expect(transport.calls).toEqual([]);
  await steward.ask('Simulated: draft questions', context);
  queue.seal(draw.writ_id);
  const sealed = queue.getSnapshot();
  expect((await steward.amend(draw.writ_id, 'Simulated amendment', context)).proposals).toEqual([]);
  expect((await steward.tearUp(draw.writ_id)).proposals).toEqual([]);
  expect(queue.getSnapshot()).toBe(sealed);
  expect(transport.calls).toHaveLength(1);
});

test('an in-flight result cannot replace a draft sealed by a human', async () => {
  const queue = new ProposalQueue();
  const transport = new RecordedStewardTransport([reply(draw)]);
  const steward = new LiveSteward(transport, queue);
  await steward.ask('Simulated: draft questions', context);
  let finish: ((text: string) => void) | undefined;
  vi.spyOn(transport, 'ask').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const pending = steward.amend(draw.writ_id, 'Simulated amendment', context);
  queue.seal(draw.writ_id);
  const sealed = queue.getSnapshot();
  if (!finish) throw new Error('Expected pending transport');
  finish(reply(draw));
  expect((await pending).proposals).toEqual([]);
  expect(queue.getSnapshot()).toBe(sealed);
});

test.each([
  { ...draw, updated_at: '2026-10-26T23:59:59Z' },
  { ...draw, created_at: '2026-10-26T00:00:00Z' },
  { ...draw, writ_id: '01ARZ3NDEKTSV4RRFFQ69G5FAW' },
])('amend refuses a stale or mismatched writ: $updated_at / $writ_id', async response => {
  const queue = new ProposalQueue();
  const steward = new LiveSteward(new RecordedStewardTransport([reply(draw), reply(response)]), queue);
  await steward.ask('Simulated: draft questions', context);
  const before = queue.getSnapshot();
  expect((await steward.amend(draw.writ_id, 'Simulated amendment', context)).proposals).toEqual([]);
  expect(queue.getSnapshot()).toBe(before);
});

test('a new ask cannot overwrite an existing writ ID', async () => {
  const queue = new ProposalQueue();
  const steward = new LiveSteward(new RecordedStewardTransport([reply(draw), reply(draw)]), queue);
  await steward.ask('Simulated: draft questions', context);
  const before = queue.getSnapshot();
  expect((await steward.ask('Simulated: another draft', context)).proposals).toEqual([]);
  expect(queue.getSnapshot()).toBe(before);
});

test('default and fixture-backed live turns never touch global fetch or WebSocket or seal', async () => {
  const network = vi.fn(() => { throw new Error('Network forbidden in this test'); });
  vi.stubGlobal('fetch', network);
  vi.stubGlobal('WebSocket', network);
  const simulated = createSteward({ queue: new ProposalQueue() });
  await simulated.ask('draft a question draw', context);
  const queue = new ProposalQueue();
  const transport = new RecordedStewardTransport([reply(draw), reply(draw), reply({ ...draw, status: 'torn' })]);
  const live = createSteward({ live: true, transport, queue });
  await live.ask('Simulated: draft questions', context);
  await live.amend(draw.writ_id, 'Simulated: keep three winners', context);
  await live.tearUp(draw.writ_id);
  expect(transport.calls.map(call => call.method)).toEqual(['steward.ask', 'steward.ask', 'steward.writ.tear']);
  expect(network).not.toHaveBeenCalled();
});

test('after an unconfirmed seal, a second seal and a tear reply with the unknown-outcome sentence, never No authorization was given', async () => {
  const queue = new ProposalQueue();
  const transport = new RecordedStewardTransport([reply(draw)]);
  const seal = vi.spyOn(transport, 'seal').mockRejectedValue(new Error('Simulated timeout'));
  const tear = vi.spyOn(transport, 'tear');
  const steward = new LiveSteward(transport, queue);
  await steward.ask('Synthetic draw', context);
  const unknown = await steward.seal(draw.writ_id);
  const before = queue.getSnapshot();
  expect(unknown.reply).toContain('Reconcile its outcome with the core');
  for (const turn of [await steward.seal(draw.writ_id), await steward.tearUp(draw.writ_id),
    await steward.amend(draw.writ_id, 'Synthetic amendment', context),
    await steward.ask('Synthetic amendment', { ...context, selected_proposal_id: draw.writ_id })]) {
    expect(turn.reply).toBe(unknown.reply);
    expect(turn.reply).not.toContain('No authorization was given');
  }
  expect(queue.getSnapshot()).toBe(before);
  expect(seal).toHaveBeenCalledTimes(1);
  expect(tear).not.toHaveBeenCalled();
});

test.each([true, false])('uncertain(id) is true after a rejected seal reply and false for a confirmed one: %s', async confirmed => {
  const transport = new RecordedStewardTransport([reply(draw)]);
  vi.spyOn(transport, 'seal').mockResolvedValue(reply({ ...draw, status: confirmed ? 'sealed' : 'proposed' }));
  const steward = new LiveSteward(transport, new ProposalQueue());
  await steward.ask('Synthetic draw', context);
  expect(steward.uncertain(draw.writ_id)).toBe(false);
  expect(steward.uncertain('missing')).toBe(false);
  await steward.seal(draw.writ_id);
  expect(steward.uncertain(draw.writ_id)).toBe(!confirmed);
});
