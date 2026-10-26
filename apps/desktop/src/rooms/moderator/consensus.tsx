import type { ConsensusGetResult } from '@castle-control/contract';
import { ConsensusChart } from '@castle-control/ui';
import { illustrativeConsensus } from '../../moderation-fixture.js';

/** Read-only sample history. No action port is accepted. */
export function Consensus({ results }: { results: readonly ConsensusGetResult[] }) {
  const inks = ['azure', 'or', 'gules', 'ink'] as const;
  const directions = ['go-left', 'hype', 'skip-boss', 'go-right'] as const;
  return <section className="moderator-consensus"><h3>The Herald’s chart · illustrative</h3>
    <p>15 minutes of sample consensus · describes the room, never acts on anyone.</p>
    <svg viewBox="0 0 560 170" role="img" aria-label="Illustrative stacked share of chat per direction">
      {directions.map((key, index) => {
        const top = illustrativeConsensus.map((row, minute) => {
          const total = directions.slice(0, index + 1).reduce((sum, direction) => sum + row[direction], 0);
          return `${minute / 14 * 560},${170 - total / 100 * 170}`;
        });
        const bottom = illustrativeConsensus.map((row, minute) => {
          const total = directions.slice(0, index).reduce((sum, direction) => sum + row[direction], 0);
          return `${minute / 14 * 560},${170 - total / 100 * 170}`;
        }).reverse();
        return <polygon key={key} points={[...top, ...bottom].join(' ')} fill={`var(--${inks[index]})`}><title>{key}</title></polygon>;
      })}
    </svg><p>min 0 → min 14 · left 51.3% · illustrative</p>
    <ConsensusChart title="Consensus filters · simulated fixture" filter_label="Messages" empty_state="No consensus history available."
      results={results.map(result => ({ at: result.at, window_s: result.window_s,
        label: result.filter.kind === 'emote' ? result.filter.emote : result.filter.kind === 'all' ? 'All messages' : result.filter.kind === 'emotes' ? 'Emotes only' : 'Text only',
        aria_label: 'Simulated opinion direction history', summary: `${result.shed_count} messages shed · barred messages excluded · simulated`,
        directions: result.directions.map(item => ({ key: item.key, label: item.label, share: item.share, series: item.series,
          change_label: item.delta_3m === undefined ? 'History unavailable' : `${(item.delta_3m * 100).toFixed(1)} pp / 3 min` })),
      }))} />
  </section>;
}
