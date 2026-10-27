import { expect, test } from 'vitest';
import { ProposalQueue } from './queue.js';
import { SimulatedSteward } from './simulated.js';
import type { ChamberId, ProposalKind, StewardContext } from './port.js';

const context: StewardContext = { surface: 'overview' };
const grammar: readonly {
  text: string; chamber?: ChamberId; kind?: ProposalKind;
  fields?: Readonly<Record<string, string | number | boolean>>; layer?: string; amend?: boolean;
}[] = [
  { text: 'draft a question draw', chamber: 'lottery', kind: 'seal',
    fields: { winners: 3, cap: '1/3 of winners', cooldown: 'no repeat for 3 draws', prize: 'none' }, layer: 'draw' },
  { text: 'make it 5 winners', chamber: 'lottery', kind: 'seal', fields: { winners: 5 }, layer: 'draw', amend: true },
  { text: 'make it five winners', chamber: 'lottery', kind: 'seal', fields: { winners: 5 }, layer: 'draw', amend: true },
  { text: 'no raiders', chamber: 'lottery', kind: 'seal', fields: { cap: 'raiders excluded' }, layer: 'draw', amend: true },
  { text: 'prize is a signed print', chamber: 'lottery', kind: 'seal', fields: { prize: 'a signed print' }, layer: 'draw', amend: true },
  { text: 'pass h1', chamber: 'moderator', kind: 'seal', fields: { verdict: 'pass', line: 'h1' }, layer: 'chat' },
  { text: 'bar h2', chamber: 'moderator', kind: 'seal', fields: { verdict: 'bar', line: 'h2' }, layer: 'chat' },
  { text: 'pass all as proposed', chamber: 'moderator', kind: 'seal', fields: { verdict: 'pass', line: 'all as proposed' }, layer: 'chat' },
  { text: 'raise the drawbridge', chamber: 'moderator', kind: 'seal', fields: { shield: true }, layer: 'chat' },
  { text: 'test fire 50 gifts', chamber: 'visuals', kind: 'proclaim', fields: { gifts: 50 }, layer: 'beacon' },
  { text: 'what does chat want', chamber: 'moderator', layer: 'consensus' },
  { text: 'catch me up' },
  { text: 'what should the next turn be', chamber: 'studio', kind: 'proclaim', fields: { turn: 'Preview the next unclaimed tile' }, layer: 'map' },
  { text: 'unrecognised request' },
  { text: 'restyle the beacon as hype border', chamber: 'visuals', kind: 'proclaim',
    fields: { design_action: 'restyle', artifact: 'beacon', preset_id: 'hype-border', shape: 'border', simulated: true }, layer: 'beacon' },
  { text: 'show me presets for the draw', chamber: 'lottery', kind: 'proclaim',
    fields: { design_action: 'restyle', artifact: 'draw', preset_id: 'urn', simulated: true }, layer: 'draw' },
  { text: 'design a quiet engraved look for the urn', chamber: 'lottery', kind: 'proclaim',
    fields: { design_action: 'custom', artifact: 'urn', prompt: 'quiet engraved', treatment: 'engraved', density: 'quiet', simulated: true }, layer: 'draw' },
  { text: 'restyle the map as choice board', chamber: 'studio', kind: 'proclaim',
    fields: { artifact: 'map', preset_id: 'choice-board' }, layer: 'map' },
  { text: 'restyle the overlay as stream frame', chamber: 'visuals', kind: 'proclaim',
    fields: { artifact: 'overlay', preset_id: 'stream-frame' }, layer: 'beacon' },
];

test.each(grammar)('grammar: $text', async row => {
  const queue = new ProposalQueue();
  const steward = new SimulatedSteward(queue);
  if (row.amend) await steward.ask('draft a question draw', context);
  const turn = await steward.ask(row.text, context);
  expect(turn.reply.length).toBeGreaterThan(0);
  expect(turn.reply).not.toContain('\u2014');
  expect(turn.focus).toEqual(row.chamber ? { chamber: row.chamber, layer: row.layer } : null);
  expect(turn.proposals).toHaveLength(row.kind ? 1 : 0);
  if (row.kind) {
    const proposal = turn.proposals[0];
    expect(proposal).toMatchObject({ chamber: row.chamber, kind: row.kind, state: row.amend ? 'amended' : 'drafted' });
    expect(Object.fromEntries(proposal?.fields.map(field => [field.key, field.value]) ?? [])).toMatchObject(row.fields ?? {});
    for (const field of proposal?.fields ?? []) expect(field.label).not.toContain('\u2014');
  }
  expect(queue.pending()).toHaveLength(row.kind ? 1 : 0);
});

test.each(['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'])('word count: %s', async word => {
  const words = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const steward = new SimulatedSteward(new ProposalQueue());
  await steward.ask('draft a question draw', context);
  const turn = await steward.ask(`make it ${word} winners`, context);
  expect(turn.proposals[0]?.fields.find(field => field.key === 'winners')?.value).toBe(words.indexOf(word) + 1);
});

test('the draft loop preserves id, struck history and revision through explicit amend', async () => {
  const queue = new ProposalQueue();
  const steward = new SimulatedSteward(queue);
  const draft = (await steward.ask('draft a question draw', context)).proposals[0];
  expect(draft).toBeDefined();
  if (!draft) return;
  await steward.amend(draft.id, 'make it 5 winners', context);
  const turn = await steward.amend(draft.id, 'make it 7 winners', context);
  expect(turn.proposals[0]).toMatchObject({ id: draft.id, revision: 3, state: 'amended' });
  expect(turn.proposals[0]?.fields.find(field => field.key === 'winners')?.struck).toEqual([3, 5]);
  expect(queue.pending()).toHaveLength(1);
});

test('selection targets the chosen draft; explicit missing or terminal targets do not fall back', async () => {
  const queue = new ProposalQueue();
  const steward = new SimulatedSteward(queue);
  const first = (await steward.ask('draft a question draw', context)).proposals[0];
  await steward.ask('draft a question draw', context);
  if (!first) throw new Error('Expected draft');
  await steward.ask('make it 9 winners', { ...context, selected_proposal_id: first.id });
  expect(queue.getSnapshot().proposals[0]?.revision).toBe(2);
  expect(queue.getSnapshot().proposals[1]?.revision).toBe(1);
  expect((await steward.amend('missing', 'make it 5 winners', context)).proposals).toEqual([]);
  queue.seal(first.id);
  expect((await steward.amend(first.id, 'make it 5 winners', context)).proposals).toEqual([]);
  expect((await steward.ask('make it 5 winners', { ...context, selected_proposal_id: first.id })).proposals).toEqual([]);
});

test.each(['make it 0 winners', 'make it 9007199254740992 winners', 'test fire 0 gifts', 'test fire 1e3 gifts'])('invalid count: %s', async text => {
  const queue = new ProposalQueue();
  const steward = new SimulatedSteward(queue);
  await steward.ask('draft a question draw', context);
  const before = queue.getSnapshot();
  expect((await steward.ask(text, context)).proposals).toEqual([]);
  expect(queue.getSnapshot()).toBe(before);
});

test('amendment without a draft asks for one; a new draft never reuses a terminal id', async () => {
  const queue = new ProposalQueue();
  const steward = new SimulatedSteward(queue);
  expect((await steward.ask('no raiders', context)).proposals).toEqual([]);
  const draft = (await steward.ask('draft a question draw', context)).proposals[0];
  if (!draft) throw new Error('Expected draft');
  expect((await steward.tearUp(draft.id)).proposals[0]?.state).toBe('torn');
  expect(queue.pending()).toEqual([]);
  expect((await steward.tearUp('missing')).proposals).toEqual([]);
  const next = (await new SimulatedSteward(queue).ask('draft a question draw', context)).proposals[0];
  expect(next?.id).not.toBe(draft.id);
});

test('facts are injected, copied, and sample defaults are labelled', async () => {
  const facts = { label: 'Recorded fixture', held_count: 12, consensus_direction: 'North\u2014east', consensus_percent: 61, next_turn: 'Preview tile C4' };
  const steward = new SimulatedSteward(new ProposalQueue(), facts);
  facts.held_count = 900;
  const brief = await steward.ask('catch me up', context);
  expect(brief.reply).toContain('12');
  expect(brief.reply).toContain('Recorded fixture');
  expect(brief.reply).not.toContain('\u2014');
  expect((await steward.ask('what does chat want', context)).reply).toContain('61%');
  expect((await steward.ask('what should the next turn be', context)).proposals[0]?.fields[0]?.value).toBe('Preview tile C4');
  expect((await new SimulatedSteward(new ProposalQueue()).ask('catch me up', context)).reply).toMatch(/sample/i);
});

test('same initial queue, facts and inputs produce identical outputs', async () => {
  const left = new SimulatedSteward(new ProposalQueue());
  const right = new SimulatedSteward(new ProposalQueue());
  for (const row of grammar) expect(await left.ask(row.text, context)).toEqual(await right.ask(row.text, context));
});

test('the Steward never authorizes a proposal, even when asked to approve one', async () => {
  const queue = new ProposalQueue();
  const steward = new SimulatedSteward(queue);
  for (const row of grammar) await steward.ask(row.text, context);
  for (const text of ['seal it', 'yes', 'approve it', 'proclaim it', 'do it']) {
    const turn = await steward.ask(text, context);
    expect(turn.proposals).toEqual([]);
    expect(turn.reply).toMatch(/hold/i);
  }
  expect(queue.getSnapshot().proposals.every(proposal => ['drafted', 'amended'].includes(proposal.state))).toBe(true);
});

test('input keeps prize and line case; mixed case and punctuation still match', async () => {
  const steward = new SimulatedSteward(new ProposalQueue());
  await steward.ask('DRAFT a question draw!', context);
  const prize = await steward.ask('Prize is a Signed Print.', context);
  expect(prize.proposals[0]?.fields.find(field => field.key === 'prize')?.value).toBe('a Signed Print');
  const pass = await steward.ask('Pass Message42', context);
  expect(pass.proposals[0]?.fields.find(field => field.key === 'line')?.value).toBe('Message42');
});

test('design requests list presets and stay simulated until explicitly previewed and held', async () => {
  const queue = new ProposalQueue(); const steward = new SimulatedSteward(queue);
  const list = await steward.ask('Show me presets for the DRAW!', context);
  expect(list.reply).toContain('SIMULATED');
  for (const label of ['Urn', 'Wheel', 'Deck', 'Ballot box', 'Overlord urn']) expect(list.reply).toContain(label);
  expect(list.proposals[0]?.title).toBe('Restyle');
  expect(queue.pending()).toHaveLength(1);
  expect((await steward.ask('seal it', context)).proposals).toEqual([]);
  expect(queue.pending()[0]?.state).toBe('drafted');
});

test.each([
  ['restyle the beacon as hype border', 'restyle the beacon as gilded camera frame', 'preset_id', 'gilded-camera-frame'],
  ['design a quiet look for the urn', 'design a bold engraved look for the urn', 'density', 'bold'],
])('design amendments preserve history: %s', async (initial, amendment, key, value) => {
  const queue = new ProposalQueue(); const steward = new SimulatedSteward(queue);
  const proposal = (await steward.ask(initial, context)).proposals[0];
  if (!proposal) throw new Error('Expected design proposal');
  const next = await steward.amend(proposal.id, amendment, context);
  expect(next.reply).toContain('SIMULATED');
  expect(next.proposals[0]).toMatchObject({ id: proposal.id, state: 'amended', revision: 2 });
  expect(next.proposals[0]?.fields.find(field => field.key === key)).toMatchObject({ value });
  expect(next.proposals[0]?.fields.find(field => field.key === key)?.struck).toHaveLength(1);
  expect(queue.pending()).toHaveLength(1);
  expect((await steward.tearUp(proposal.id)).proposals[0]?.state).toBe('torn');
  expect((await steward.amend(proposal.id, amendment, context)).proposals).toEqual([]);
});

test.each(['restyle the beacon as remote code', 'design a ' + 'x'.repeat(201) + ' look for the urn'])('invalid design request: %s', async text => {
  const queue = new ProposalQueue(); const steward = new SimulatedSteward(queue);
  const before = queue.getSnapshot();
  expect((await steward.ask(text, context)).proposals).toEqual([]);
  expect(queue.getSnapshot()).toBe(before);
});
