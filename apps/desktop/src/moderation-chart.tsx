import type { ConsensusGetResult } from '@castle-control/contract';
import { ConsensusChart as Chart } from '@castle-control/ui';
import { moderationCopy } from './moderation-copy.js';

/** Domain labels and contract shaping stay at the desktop boundary. */
export function ConsensusChart({ results }: { results: readonly ConsensusGetResult[] }) {
  return <Chart title={`${moderationCopy.consensus} · consensus`} filter_label="Messages" empty_state="No consensus history available."
    results={results.map(result => ({
      at: result.at, window_s: result.window_s,
      label: result.filter.kind === 'emote' ? result.filter.emote
        : result.filter.kind === 'all' ? 'All messages' : result.filter.kind === 'emotes' ? 'Emotes only' : 'Text only',
      aria_label: `Opinion direction history over ${result.window_s / 60} minutes; simulated`,
      summary: `${result.window_s / 60} min · ${result.shed_count} messages shed · barred messages excluded · simulated`,
      directions: result.directions.map(item => ({
        key: item.key, label: item.label, share: item.share, series: item.series,
        change_label: item.delta_3m === undefined ? 'History unavailable' : `${item.delta_3m >= 0 ? '+' : ''}${(item.delta_3m * 100).toFixed(1)} pp / 3 min`,
      })),
    }))} />;
}
