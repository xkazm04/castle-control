import { isPending } from '@castle-control/ui/steward';
import type { Proposal, ProposalQueue } from '@castle-control/ui/steward';
import { checkFixturePolicy, createLotsPreview, intakeResumeHint } from '../../lots-model.js';
import type { LotsPort } from '../../lots-model.js';
import type { FixtureEntry } from '../../lots-fixture.js';
import type { LotsDraw, LotsSealedRoll } from '@castle-control/contract';
import { createDrawDisplay } from './display.js';
import type { DrawDisplayPort } from './display.js';
import { prepareFixtureRoll, rehearsalClock, simulateCast } from './simulation.js';
import { createRevealClock } from './playback.js';

type FrozenRoll = LotsSealedRoll & { entries: readonly FixtureEntry[]; bytes: string; hash: string };
type Session = { port: LotsPort; clock: () => Date; reveal: ReturnType<typeof createRevealClock>;
  display: DrawDisplayPort; rolls: Map<string, FrozenRoll>; drafts: Map<string, LotsDraw> };
const sessions = new WeakMap<ProposalQueue, Session>();
export function lotterySession(queue: ProposalQueue): Session {
  let session = sessions.get(queue);
  if (!session) { session = { port: createLotsPreview(), clock: rehearsalClock, reveal: createRevealClock(),
    display: createDrawDisplay(), rolls: new Map(), drafts: new Map() }; sessions.set(queue, session); }
  return session;
}

export function draftRoll(queue: ProposalQueue, port = lotterySession(queue).port): void {
  const draw = port.getSnapshot().draw;
  const cap = draw.rules.cohort_caps.find(cap => cap.cohort === 'raider');
  let id = `roll-${queue.getSnapshot().proposals.length + 1}`;
  while (queue.getSnapshot().proposals.some(item => item.id === id)) id += '-next';
  queue.addOrUpdate({ id, chamber: 'lottery', kind: 'seal', title: draw.name, revision: 1, state: 'drafted', fields: [
    { key: 'winners', label: 'Winners', value: draw.rules.winner_count, struck: [] },
    { key: 'cap', label: 'Raid cohort cap', value: cap ? `${cap.numerator}/${cap.denominator} of winners` : 'none', struck: [] },
    { key: 'cooldown', label: 'Cooldown', value: `${draw.rules.cooldown_s} seconds`, struck: [] },
    { key: 'prize', label: 'Prize', value: draw.policy.content === 'prize' ? 'Prize example' : 'none', struck: [] },
  ] });
  lotterySession(queue).drafts.set(id, draw);
  queue.select(id);
}

export async function entryHash(bytes: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(bytes));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Offline rehearsal. Preserve the separate JSON digest for existing proposal
 * seals; also freeze a v1 roll and seal for this session's immutable cast. */
export async function sealLotteryProposal(queue: ProposalQueue, proposal: Proposal): Promise<void> {
  const { port, rolls, drafts, clock } = lotterySession(queue);
  const before = port.getSnapshot();
  if (before.intake_pending) throw new Error(intakeResumeHint);
  const planned = drafts.get(proposal.id);
  const source = planned && planned.draw_id !== before.draw.draw_id ? planned : before.draw;
  if (!isPending(proposal) || proposal.kind !== 'seal') throw new Error('Choose an open roll proposal.');
  const winners = proposal.fields.find(field => field.key === 'winners')?.value;
  if (typeof winners !== 'number' || !Number.isInteger(winners) || winners < 1 || winners > before.entries.length) {
    throw new Error('Winner count must fit the eligible roll.');
  }
  const prize = proposal.fields.find(field => field.key === 'prize')?.value;
  const draw = { ...source, rules: { ...source.rules, winner_count: winners },
    policy: { ...source.policy, ...(prize !== undefined && prize !== 'none' ? { content: 'prize' as const } : {}) } };
  if (before.sealed || checkFixturePolicy(draw.policy).result === 'blocked') throw new Error('Giveaway guardrails block this roll.');
  const excluded = proposal.fields.find(field => field.key === 'cap')?.value === 'raiders excluded';
  const entries = Object.freeze(before.entries.filter(entry => !excluded || entry.cohort !== 'raider')
    .map(entry => Object.freeze({ ...entry })));
  if (winners > entries.length) throw new Error('Winner count exceeds the frozen eligible roll.');
  // Prove a rehearsal can respect the frozen cap before changing the queue.
  simulateCast(draw, entries);
  // Explicit field order and UTF-8 JSON are published beside the seal for recomputation.
  const bytes = JSON.stringify(entries.map(({ handle, weight }) => ({ handle, weight })));
  const hash = await entryHash(bytes);
  // Reject an amendment/tear before beginning any additional async hash work.
  if (queue.getSnapshot().proposals.find(item => item.id === proposal.id) !== proposal || port.getSnapshot() !== before) {
    throw new Error('The proposal changed while hashing. Hold again to seal its current revision.');
  }
  const sealed = await prepareFixtureRoll(draw, entries, clock());
  const current = queue.getSnapshot().proposals.find(item => item.id === proposal.id);
  if (current !== proposal || port.getSnapshot() !== before) throw new Error('The proposal changed while hashing. Hold again to seal its current revision.');
  const result = queue.seal(proposal.id, hash);
  if (!result.ok) throw new Error(result.reason);
  rolls.set(proposal.id, { entries, bytes, hash, ...sealed });
  port.edit(draw);
  await port.seal(entries, sealed);
}
