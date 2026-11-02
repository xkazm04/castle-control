import type { LotsDraw, LotsWrit } from '@castle-control/contract';
import type { DrawShape } from '@castle-control/renderer';
import { proposalQueue } from '@castle-control/ui/steward';
import type { FlowLine } from '@castle-control/ui/steward-flow';
import { checkFixturePolicy } from '../../lots-model.js';
import { fixtureBeaconWrit, fixtureWrit } from '../../lots-fixture.js';
import type { CoreLotsPort } from '../../lots-core.js';
import { draftRoll, lotterySession, sealLotteryProposal } from './session.js';
import { coreStage } from './core-stage.js';
import { inspectWrit } from './lab-model.js';
import type { TamperKind } from './lab-model.js';
import { defaultTamperIndex } from './lab-model.js';
import { labVerdict } from './lab.jsx';
import { quicknet_anchor, simulated_anchor } from './beacon-anchors.js';
import type { RevealStyle } from './flow-model.js';

/**
 * The Lot Chamber's flow seals, loaded only when a hold lands. Every function drives the
 * chamber's existing fixture or core port; none adds a new path to a seal or a cast.
 */
const short = (hash: string | undefined) => hash ? `${hash.slice(0, 8)}…${hash.slice(-4)}` : 'pending';

/** Fixture: pick the preset, apply the draft, draft the roll proposal and seal it on the existing path. */
export async function sealFixtureDraw(draw: LotsDraw, shape: DrawShape): Promise<FlowLine[]> {
  const queue = proposalQueue;
  const { port, display } = lotterySession(queue);
  if (checkFixturePolicy(draw.policy).result === 'blocked') throw new Error('Giveaway guardrails block this roll.');
  port.select(draw.draw_id);
  port.edit(draw);
  if (JSON.stringify(port.getSnapshot().draw) !== JSON.stringify(draw)) throw new Error(port.getSnapshot().notice);
  display.edit({ shape });
  display.theatre(false);
  draftRoll(queue, port);
  const id = queue.getSnapshot().selected_proposal_id;
  const proposal = queue.getSnapshot().proposals.find(item => item.id === id);
  if (!proposal) throw new Error('The roll proposal was not drafted.');
  await sealLotteryProposal(queue, proposal);
  const state = port.getSnapshot();
  return [{ label: 'Lots frozen', value: String(state.entries.length) },
    { label: 'Winners to draw', value: String(state.draw.rules.winner_count) },
    { label: 'Seal', value: short(state.sealed_roll?.seal) }];
}

function revealDisplay(style: RevealStyle) {
  return { by_hand: style === 'hand', sound: style === 'ceremony' };
}

export async function castFixture(style: RevealStyle): Promise<FlowLine[]> {
  const { port, display } = lotterySession(proposalQueue);
  display.edit(revealDisplay(style));
  await port.start();
  const state = port.getSnapshot();
  if (!state.started) throw new Error(state.notice);
  return [{ label: 'Winners drawn', value: String(state.simulated_winners?.length ?? 0) }, { label: 'Seal', value: short(state.sealed_roll?.seal) }];
}

/** Rehearse again: a cast is never replaced, so a fresh roll is drafted from the same setup first. */
export function reopenFixture() {
  const { port } = lotterySession(proposalQueue);
  if (port.getSnapshot().started) port.reopen();
}
export function fixtureDrawNow(): LotsDraw { return lotterySession(proposalQueue).port.getSnapshot().draw; }
export function fixtureShapeNow(): DrawShape { return lotterySession(proposalQueue).display.getSnapshot().shape; }
export function fixtureWinners(): readonly string[] { return lotterySession(proposalQueue).port.getSnapshot().simulated_winners ?? []; }

export type ProveChoice = 'cast' | 'specimen' | 'beacon';
const fixture_anchors = [quicknet_anchor, simulated_anchor] as const;
const core_anchors = [quicknet_anchor] as const;

/** Run the four-step proof on the chosen writ (and the chosen forgery) and word the verdict. */
export async function proveWrit(choice: ProveChoice, tamper: TamperKind | undefined, core?: CoreLotsPort): Promise<{ say: string; lines: FlowLine[] }> {
  const writ: LotsWrit = core ? core.getSnapshot().writ ?? fixtureWrit
    : choice === 'beacon' ? fixtureBeaconWrit : choice === 'cast' ? lotterySession(proposalQueue).port.getSnapshot().writ ?? fixtureWrit : fixtureWrit;
  if (core && !core.getSnapshot().writ) throw new Error('No core writ yet.');
  const report = await inspectWrit(writ, tamper ? { kind: tamper, index: defaultTamperIndex(writ) } : undefined, core ? core_anchors : fixture_anchors);
  const names = { serialization: 'Roll', seal: 'Seal', randomness: 'Seed', derivation: 'Winners' } as const;
  const words = { pass: 'Pass', fail: 'Fail', blocked: 'Not reached', unverified: 'Unverified' } as const;
  return { say: labVerdict(report), lines: report.steps.map(step => ({ label: names[step.id], value: words[step.status] })) };
}

/** Core: select (or create) the draw, save the drafted rules in one upsert, then seal on the existing core path. */
export async function sealCoreDraw(port: CoreLotsPort, pick: string, apply: (draw: LotsDraw) => LotsDraw, shape: DrawShape | undefined): Promise<FlowLine[]> {
  if (pick === 'new') await port.createQuestionDraw();
  else if (port.getSnapshot().draw?.draw_id !== pick) await port.select(pick);
  const draw = port.getSnapshot().draw;
  if (!draw || (pick !== 'new' && draw.draw_id !== pick)) throw new Error(port.getSnapshot().notice);
  const next = apply(draw);
  if (JSON.stringify(next) !== JSON.stringify(draw)) await port.edit(next);
  if (shape) coreStage(port).display.edit({ shape });
  await port.seal();
  const state = port.getSnapshot();
  if (!state.sealed || !state.seal_result) throw new Error(state.notice);
  const plan = state.seal_result.sealed.roll.randomness;
  return [{ label: 'Lots frozen', value: String(state.entries.length) },
    { label: 'Seal', value: short(state.seal_result.sealed.seal) },
    { label: 'Public round', value: plan.source === 'drand_quicknet' ? `drand quicknet ${plan.round}` : 'Streamer commit' }];
}

export async function castCore(port: CoreLotsPort, style: RevealStyle): Promise<FlowLine[]> {
  const stage = coreStage(port);
  stage.display.edit(revealDisplay(style));
  await port.start();
  const state = port.getSnapshot();
  if (!state.started || !state.cast_result) throw new Error(state.notice);
  return [{ label: 'Winners drawn', value: String(state.cast_result.cast.winners.length) }, { label: 'Seal', value: short(state.cast_result.cast.seal) }];
}
