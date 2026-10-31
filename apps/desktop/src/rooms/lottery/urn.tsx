import { rowHeight, WindowedRows } from '@castle-control/ui';
import type { CSSProperties } from 'react';
import type { LotsHandle } from '@castle-control/contract';
import type { FixtureEntry } from '../../lots-fixture.js';
import { lotsCopy as copy } from '../../lots-copy.js';

type UrnProps = { entries: readonly FixtureEntry[]; scroll_top?: number; winners?: readonly LotsHandle[]; revealed?: number };
/** One entry-count-derived layout. Trusted in-process props; no wire parser. */
function parseUrnProps({ entries, scroll_top = 0, winners = [], revealed = 0 }: UrnProps) {
  const count = entries.length;
  const columns = Math.max(1, Math.min(20, Math.ceil(Math.sqrt(count))));
  const svg_limit = columns * 16;
  const dot_radius = Math.min(5, 52 / Math.sqrt(Math.max(1, count)));
  const visible = winners.slice(0, Math.max(0, Math.floor(revealed)));
  const order = (handle: LotsHandle) => { const index = visible.indexOf(handle); return index < 0 ? undefined : index + 1; };
  const style: CSSProperties & { '--urn-columns': number } = { '--urn-columns': columns };
  return { count, columns, svg_limit, dot_radius, visible, order, style, entries, scroll_top };
}

export function Urn(props: UrnProps) {
  const { entries, count, columns, svg_limit, dot_radius, visible, order, style, scroll_top } = parseUrnProps(props);
  const rows = Array.from({ length: Math.ceil(count / columns) }, (_, index) => entries.slice(index * columns, (index + 1) * columns));
  return count <= svg_limit ? <svg className="cc-urn" viewBox="18 36 424 348" role="img" aria-label={copy.urn_label(count)}>
      <ellipse cx="230" cy="210" rx="205" ry="168" />
      {entries.map((entry, index) => {
        const angle = index * Math.PI * (3 - Math.sqrt(5));
        const radius = 180 * Math.sqrt((index + 0.5) / count);
        const x = 230 + radius * Math.cos(angle); const y = 210 + radius * Math.sin(angle) * 0.78;
        const winner = order(entry.handle);
        return <g key={entry.handle}>
          <circle data-lot-dot={entry.number} data-cohort={entry.cohort} data-winner={winner}
            cx={x} cy={y} r={dot_radius}><title>{`${entry.handle} · ${copy.cohorts[entry.cohort]}`}</title></circle>
          {winner && <g className="lottery-winner-badge" aria-label={`${winner}. ${entry.handle}`}>
            <circle cx={x} cy={y} r={dot_radius + 6} /><text x={x} y={y}>{winner}</text>
          </g>}
        </g>;
      })}
    </svg> : <div className="lottery-urn-window" style={style}>
      <WindowedRows rows={rows} label={copy.dots} row_key={row => String(row[0]?.number)} row_height={rowHeight} scroll_top={scroll_top}>
        {row => <div className="lottery-marks">{row.map(entry =>
          <span key={entry.handle} data-lot-dot={entry.number} data-cohort={entry.cohort} data-revealed-dot={order(entry.handle)}
            title={`${entry.handle} · ${copy.cohorts[entry.cohort]}`}>{order(entry.handle) ?? '●'}</span>)}</div>}
      </WindowedRows>
      {/* Keep a revealed winner visible even when its pool row is outside the window. */}
      {visible.length > 0 && <WindowedRows rows={visible.map((handle, index) => ({ handle, order: index + 1 }))}
        label={copy.revealed_winners} row_key={winner => winner.handle}>
        {winner => <p className="lottery-revealed" data-winner={winner.order} data-revealed-winner={winner.order}>
          <b>{winner.order}.</b> {winner.handle}</p>}
      </WindowedRows>}
    </div>;
}
