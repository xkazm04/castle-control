import { rowHeight, WindowedRows } from '@castle-control/ui';
import type { FixtureEntry } from '../../lots-fixture.js';
import { lotsCopy as copy } from '../../lots-copy.js';

export function Urn({ entries, scroll_top = 0 }: { entries: readonly FixtureEntry[]; scroll_top?: number }) {
  const rows = Array.from({ length: Math.ceil(entries.length / 20) }, (_, index) => entries.slice(index * 20, (index + 1) * 20));
  return entries.length <= 320 ? <svg className="cc-urn" viewBox="18 36 424 348" role="img" aria-label={copy.urn_label(entries.length)}>
      <ellipse cx="230" cy="210" rx="205" ry="168" />
      {entries.map((entry, index) => {
        const angle = index * Math.PI * (3 - Math.sqrt(5));
        const radius = 180 * Math.sqrt((index + 0.5) / entries.length);
        return <circle key={entry.handle} data-lot-dot={entry.number} data-cohort={entry.cohort}
          cx={230 + radius * Math.cos(angle)} cy={210 + radius * Math.sin(angle) * 0.78} r={5}>
          <title>{`${entry.handle} · ${copy.cohorts[entry.cohort]}`}</title></circle>;
      })}
    </svg> : <div className="lottery-urn-window"><WindowedRows rows={rows} label={copy.dots} row_key={row => String(row[0]?.number)}
      row_height={rowHeight} scroll_top={scroll_top}>{row => <div className="lottery-marks">{row.map(entry =>
        <span key={entry.handle} data-lot-dot={entry.number} data-cohort={entry.cohort} title={`${entry.handle} · ${copy.cohorts[entry.cohort]}`}>●</span>)}</div>}
    </WindowedRows></div>;
}
