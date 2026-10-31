import { InkButton, RuledFeed, RuledRow, SectionHeading } from '@castle-control/ui';
import { boardGeometry } from './board.js';
import type { StudioBoard } from './board.js';
import { rehearseCopy as copy } from './rehearse-copy.js';
import { turnLine } from './rehearse-state.js';
import type { PastRun, RehearseState, RehearseView, SizeCompare } from './rehearse-state.js';
import type { RehearseHandlers } from './use-rehearse.js';

const ROOT3 = Math.sqrt(3);
const CORNERS = [[0, -1], [ROOT3 / 2, -0.5], [ROOT3 / 2, 0.5], [0, 1], [-ROOT3 / 2, 0.5], [-ROOT3 / 2, -0.5]] as const;

/** A static, label-only picture of a finished board: SVG geometry, house inks from data-ink. */
export function MiniBoard({ board, label }: { board: StudioBoard; label: string }) {
  const geometry = boardGeometry(board);
  return <svg className="studio-mini" viewBox={`0 0 ${(geometry.width * ROOT3).toFixed(3)} ${geometry.height.toFixed(3)}`}
    role="img" aria-label={label}>
    {geometry.tiles.map(tile => <polygon key={tile.id} data-ink={tile.side?.ink} data-unclaimed={!tile.side}
      points={CORNERS.map(([x, y]) => `${(tile.centre.x * ROOT3 + x * 0.92).toFixed(3)},${(tile.centre.y + y * 0.92).toFixed(3)}`).join(' ')} />)}
  </svg>;
}

export function TurnLog({ state, board }: { state: RehearseState; board: StudioBoard }) {
  const run = state.run;
  const played = run ? run.turns.slice(0, state.turn) : [];
  return <section className="studio-turn-log" aria-label={copy.log_label}>
    <SectionHeading variant="ruled" title={copy.log} />
    <div className="studio-turn-scroll">
      <RuledFeed role="list" aria-label={copy.log_label}>
        {played.length === 0 ? <p className="studio-turn-empty" role="listitem">{copy.log_empty}</p>
          : played.map((turn, index) => run && <div role="listitem" key={turn.turn} className="studio-turn-row"
            aria-current={index === played.length - 1 ? 'step' : undefined} data-current={index === played.length - 1}>
            <RuledRow mark={copy.turn_word(turn.turn)}><span title={turnLine(run, turn)}>{turnLine(run, turn).replace(/^Turn \d+: /, '')}</span></RuledRow>
          </div>)}
      </RuledFeed>
    </div>
    <TileHistory state={state} board={board} />
  </section>;
}

export function BalanceTable({ view }: { view: RehearseView }) {
  const report = view.report;
  if (!report) return null;
  const rows: readonly (readonly [string, string])[] = [
    [copy.spread, copy.spread_value(report.shares.map(share => share.percent), report.unclaimed_percent)],
    [copy.margin, copy.margin_value(report.margin)],
    [copy.chokepoints, copy.chokepoints_value(report.chokepoints)],
    [copy.last_change, report.last_change === 0 ? copy.none : String(report.last_change)],
    [copy.lead_changes, String(report.lead_changes)],
    [copy.verdict_row, view.done ? report.kind : copy.none],
  ];
  return <section className="studio-report" aria-label={copy.report_label}>
    <SectionHeading variant="ruled" title={copy.report} count={copy.progress(report.through, report.of)} />
    <dl>{rows.map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}</dl>
    <p className="cc-side-fine">{copy.chokepoints_hint} {copy.report_hint}</p>
  </section>;
}

function PastCard({ run, index }: { run: PastRun; index: number }) {
  return <li className="studio-past" data-verdict={run.kind}>
    <b>{copy.compare_run(index + 1)} · {copy.compare_board(run.columns, run.rows, run.tiles)}</b>
    <MiniBoard board={run.board} label={copy.mini_label(run.verdict, run.columns, run.rows)} />
    <p className="studio-past-verdict">{run.verdict}</p>
    <p className="cc-side-fine">{copy.summary(run.viewers, run.turns, run.seed)}</p>
  </li>;
}

export function ComparePast({ past, on_clear }: { past: readonly PastRun[]; on_clear: () => void }) {
  return <section className="studio-compare" aria-label={copy.compare_label}>
    <SectionHeading variant="ruled" title={copy.compare} count={past.length ? String(past.length) : undefined} />
    {past.length === 0 ? <p className="cc-side-fine">{copy.compare_hint}</p> : <>
      <ol className="studio-past-list">{past.map((run, index) => <PastCard key={run.id} run={run} index={index} />)}</ol>
      <InkButton size="small" onClick={on_clear}>{copy.clear}</InkButton>
    </>}
  </section>;
}

export function TileHistory({ state, board }: { state: RehearseState; board: StudioBoard }) {
  const run = state.run;
  const tile = boardGeometry(board).tiles.find(item => item.id === state.selected);
  if (!run || !tile) return <p className="cc-side-fine">{copy.tile_hint}</p>;
  const seen = run.turns.slice(0, state.turn);
  const changes = seen.filter(turn => turn.changes.some(change => change.id === tile.id)).length;
  const picks = seen.reduce((sum, turn) => sum + Object.values(turn.picks.find(pick => pick.id === tile.id)?.by ?? {})
    .reduce((count, value) => count + value, 0), 0);
  return <p className="cc-side-fine" role="status">{copy.tile_history(tile.id, tile.side?.label ?? copy.unclaimed, changes, picks)}</p>;
}

export function VerdictBlock({ state, view, handlers }: { state: RehearseState; view: RehearseView; handlers: RehearseHandlers }) {
  const { report, done } = view;
  if (!done || !report || !state.run) return null;
  return <section className="studio-verdict-block" aria-label={copy.verdict_label}>
    <SectionHeading variant="ruled" title={copy.verdict} count={copy.summary(state.run.setup.viewers, state.run.setup.turns, state.run.setup.seed)} />
    <p className="studio-verdict" data-verdict={report.kind}>{report.verdict}</p>
    <p className="studio-reading">{report.reading}</p>
    <div className="studio-verdict-actions">
      <InkButton size="small" onClick={handlers.replay}>{`${copy.replay} ${state.run.setup.seed}`}</InkButton>
      <InkButton variant="plate" size="small" onClick={handlers.again}>{copy.again}</InkButton>
    </div>
  </section>;
}

export function SizeTable({ sizes, current, on_size, on_clear }: {
  sizes: SizeCompare; current: string; on_size?: (id: string) => void; on_clear: () => void;
}) {
  return <section className="studio-sizes" aria-label={copy.sizes_label}>
    <SectionHeading variant="ruled" title={copy.compare_sizes} count={copy.summary(sizes.viewers, sizes.turns, sizes.seed)} />
    <table>
      <caption className="studio-visually-hidden">{copy.sizes_label}</caption>
      <thead><tr><th scope="col">{copy.size_col}</th><th scope="col">{copy.result_col}</th></tr></thead>
      <tbody>{sizes.rows.map(row => <tr key={row.id} data-verdict={row.kind} data-current={row.id === current}>
        <th scope="row"><MiniBoard board={row.board} label={copy.mini_label(row.verdict, row.columns, row.rows)} />
          <span>{row.label}</span><small>{copy.size_tiles(row.tiles)}</small></th>
        <td><b>{row.verdict}</b><small>{copy.size_last(row.last_change)}</small>
          {on_size && (row.id === current ? <em>{copy.size_current}</em>
            : <InkButton size="small" aria-label={copy.size_use(row.label)} onClick={() => on_size(row.id)}>{copy.size_use_word}</InkButton>)}
        </td>
      </tr>)}</tbody>
    </table>
    <InkButton size="small" onClick={on_clear}>{copy.clear}</InkButton>
  </section>;
}

export function RehearseSide({ state, view, handlers, size = '', on_size }: {
  state: RehearseState; view: RehearseView; handlers: RehearseHandlers; size?: string; on_size?: (id: string) => void;
}) {
  return <div className="studio-rehearse-side">
    <VerdictBlock state={state} view={view} handlers={handlers} />
    <TurnLog state={state} board={view.shown} />
    {state.sizes && <SizeTable sizes={state.sizes} current={size} {...(on_size ? { on_size } : {})} on_clear={handlers.clear_sizes} />}
    <BalanceTable view={view} />
    <ComparePast past={state.past} on_clear={handlers.clear_past} />
  </div>;
}
