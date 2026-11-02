import type { ConsensusGetResult, Decision, Verdict } from '@castle-control/contract';
import { simulatedDecision } from '../../moderation-fixture.js';

/**
 * The Play demo's generated case. Every line is SIMULATED and labelled; no real chat
 * becomes a fixture. One line is held for the streamer; the herald then moves.
 */
export type BurstLine = { id: string; text: string; verdict: Verdict };
export const demoHeldText = 'Simulated viewer 4300: I wrote a boss guide, may I share the link?';
export const demoBurst: readonly BurstLine[] = [
  { id: 'burst-1', text: 'Simulated viewer 4291: go left!! the left door', verdict: 'pass' },
  { id: 'burst-2', text: 'Simulated viewer 4292: LEFT LEFT LEFT', verdict: 'pass' },
  { id: 'burst-3', text: 'Simulated viewer 4293: hype, raid incoming', verdict: 'pass' },
  { id: 'burst-4', text: 'Simulated repeated message 4294', verdict: 'bar' },
  { id: 'burst-5', text: 'Simulated viewer 4295: go left, trust me', verdict: 'pass' },
  { id: 'burst-6', text: demoHeldText, verdict: 'hold' },
  { id: 'burst-7', text: 'Simulated viewer 4297: skip the boss please', verdict: 'pass' },
  { id: 'burst-8', text: 'Simulated viewer 4298: go left!', verdict: 'pass' },
];
export const demoHoldReason = 'AutoMod · simulated link requires moderator review';

/** Built through the fixture contract door, flagged simulated, outside the 4,200-line replay. */
export function demoHeldDecision(index = 4300): Decision {
  return simulatedDecision(index, 'held', 'hold', demoHeldText, 'links');
}

/** The herald after the burst: "Go left" surges over the last three minutes. Shares stay a whole. */
export function movedConsensus(result: ConsensusGetResult, surge = 0.095): ConsensusGetResult {
  const count = result.directions[0]?.series.length ?? 0;
  const ramp = (index: number) => Math.max(0, Math.min(1, (index - (count - 5)) / 4));
  const directions = result.directions.map((direction, position) => {
    const series = direction.series.map((point, index) => {
      const lift = surge * ramp(index);
      const others = result.directions.slice(1).reduce((sum, item) => sum + (item.series[index]?.share ?? 0), 0) || 1;
      const share = position === 0 ? point.share + lift : point.share - lift * (point.share / others);
      return { ...point, share: Math.max(0, share) };
    });
    const share = series.at(-1)?.share ?? direction.share;
    return { ...direction, series, share, delta_3m: share - (series.at(-4)?.share ?? share) };
  });
  return { ...result, directions };
}
