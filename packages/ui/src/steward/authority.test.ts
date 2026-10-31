import { expect, test, vi } from 'vitest';
import { createSealAuthority } from './authority.js';
import { LiveSteward } from './live.js';
import { ProposalQueue } from './queue.js';
import { SimulatedSteward } from './simulated.js';
import { recordedWrits, reply } from './fixtures/recorded.js';

async function setup() {
  const writ = recordedWrits[0];
  const queue = new ProposalQueue();
  const transport = { ask: vi.fn(async () => reply(writ)),
    seal: vi.fn(async () => reply({ ...writ, status: 'sealed' })),
    tear: vi.fn(async () => reply({ ...writ, status: 'torn' })) };
  const live = new LiveSteward(transport, queue);
  const proposal = (await live.ask('Simulated draft', { surface: 'room', chamber: 'lottery' })).proposals[0];
  if (!proposal) throw new Error('Missing synthetic live draft');
  const local = vi.fn(async () => undefined);
  return { queue, transport, live, proposal, local, authority: createSealAuthority({ queue, live, local }) };
}

test('a live seal waits for core confirmation and never calls the local sealer', async () => {
  const { queue, transport, proposal, local, authority } = await setup();
  let confirm: ((text: string) => void) | undefined;
  transport.seal.mockImplementation(() => new Promise(resolve => { confirm = resolve; }));
  const before = queue.getSnapshot();
  const pending = authority.seal(proposal);
  expect(authority.owner(proposal)).toBe('live');
  expect(transport.seal).toHaveBeenCalledExactlyOnceWith({ writ_id: proposal.id });
  expect(queue.getSnapshot()).toBe(before);
  confirm?.(reply({ ...recordedWrits[0], status: 'sealed' }));
  expect(await pending).toMatchObject({ ok: true, reply: 'The core confirmed your sealed configuration.' });
  expect(queue.byChamber('lottery')[0]?.state).toBe('sealed');
  expect(local).not.toHaveBeenCalled();
});

test('an unconfirmed live seal fails without falling back locally or retrying', async () => {
  const { queue, transport, proposal, local, authority } = await setup();
  transport.seal.mockRejectedValue(new Error('Synthetic failure'));
  const before = queue.getSnapshot();
  expect(await authority.seal(proposal)).toMatchObject({ ok: false, reply: expect.stringContaining('could not confirm the seal') });
  expect(queue.getSnapshot()).toBe(before);
  expect((await authority.seal(proposal)).ok).toBe(false);
  expect(transport.seal).toHaveBeenCalledTimes(1);
  expect(local).not.toHaveBeenCalled();
});

test.each(([
  { action: 'seal', method: 'seal', refusal: 'The proposal could not be sealed.' },
  { action: 'tear', method: 'tearUp', refusal: 'The proposal could not be torn up.' },
] as const).flatMap(route => [
  { failure: 'thrown Error', cause: new Error('Synthetic live failure'), rejects: false },
  { failure: 'rejected Error', cause: new Error('Synthetic live failure'), rejects: true },
  { failure: 'thrown non-Error', cause: 'Synthetic live failure', rejects: false },
  { failure: 'rejected non-Error', cause: 'Synthetic live failure', rejects: true },
].map(failure => ({ ...route, ...failure }))))(
  'a live $action refuses a $failure without changing the pending queue or falling back locally',
  async ({ action, method, refusal, cause, rejects }) => {
    const { queue, live, proposal, local, authority } = await setup();
    const operation = vi.spyOn(live, method).mockImplementationOnce(() => {
      if (rejects) return Promise.reject(cause);
      throw cause;
    });
    const before = queue.getSnapshot();
    expect(authority.owner(proposal)).toBe('live');
    await expect(authority[action](proposal)).resolves.toEqual({
      ok: false, reply: cause instanceof Error ? cause.message : refusal,
    });
    expect(operation).toHaveBeenCalledExactlyOnceWith(proposal.id);
    expect(queue.getSnapshot()).toBe(before);
    expect(queue.pending()).toEqual([proposal]);
    expect(queue.getSnapshot().proposals[0]).toMatchObject({ state: 'drafted', revision: proposal.revision });
    expect(local).not.toHaveBeenCalled();
  },
);

test('a simulated draft calls the injected room sealer exactly once', async () => {
  const { queue, transport, authority, local } = await setup();
  queue.select();
  const proposal = (await new SimulatedSteward(queue).ask('draft a question draw', { surface: 'room', chamber: 'lottery' })).proposals[0];
  if (!proposal) throw new Error('Missing simulated draft');
  local.mockImplementation(async () => { queue.seal(proposal.id); });
  expect(authority.owner(proposal)).toBe('local');
  expect((await authority.seal(proposal)).ok).toBe(true);
  expect(local).toHaveBeenCalledExactlyOnceWith(queue, proposal);
  expect(transport.seal).not.toHaveBeenCalled();
});

test.each([true, false])('a live tear changes the queue only after confirmation: %s', async succeeds => {
  const { queue, transport, proposal, authority } = await setup();
  let confirm: ((text: string) => void) | undefined;
  let reject: ((cause: Error) => void) | undefined;
  transport.tear.mockImplementation(() => new Promise((resolve, fail) => { confirm = resolve; reject = fail; }));
  const tear = vi.spyOn(queue, 'tearUp');
  const before = queue.getSnapshot();
  const pending = authority.tear(proposal);
  expect(transport.tear).toHaveBeenCalledExactlyOnceWith({ writ_id: proposal.id });
  expect(tear).not.toHaveBeenCalled();
  expect(queue.getSnapshot()).toBe(before);
  if (succeeds) confirm?.(reply({ ...recordedWrits[0], status: 'torn' }));
  else reject?.(new Error('Synthetic failure'));
  expect((await pending).ok).toBe(succeeds);
  if (succeeds) expect(tear).toHaveBeenCalledExactlyOnceWith(proposal.id);
  else { expect(queue.getSnapshot()).toBe(before); expect(tear).not.toHaveBeenCalled(); }
});

test('stale and terminal proposals cannot reach either seal door', async () => {
  const { queue, transport, proposal, authority, local } = await setup();
  queue.amend(proposal.id, [{ key: 'after', value: 'Changed synthetic draft' }]);
  expect((await authority.seal(proposal)).ok).toBe(false);
  expect((await authority.tear(proposal)).ok).toBe(false);
  queue.tearUp(proposal.id);
  const terminal = queue.byChamber('lottery')[0];
  if (!terminal) throw new Error('Missing terminal draft');
  expect((await authority.seal(terminal)).ok).toBe(false);
  expect((await authority.tear(terminal)).ok).toBe(false);
  expect(transport.seal).not.toHaveBeenCalled();
  expect(transport.tear).not.toHaveBeenCalled();
  expect(local).not.toHaveBeenCalled();
});
