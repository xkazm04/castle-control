import { InkButton, RuledFeed, RuledRow, SectionHeading } from '@castle-control/ui';
import { EmptyState } from '@castle-control/ui';
import { boardGeometry } from './board.js';
import type { StudioBoard } from './board.js';
import { rehearseCopy as copy } from './rehearse-copy.js';
import { turnLine } from './rehearse-state.js';
import type { Sweep } from './rehearsal-sweep.js';
import { TerritoryStrip } from './rehearse-strip.jsx';
import type { CrowdCompare, PastRun, RehearseState, RehearseView, SizeCompare } from './rehearse-state.js';
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
        {played.length === 0 ? <div className="studio-turn-empty" role="listitem"><EmptyState compact glyph={false} title={copy.log_empty} /></div>
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
    [copy.verdict_row, view.done ? report.kind : copy.verdict_pending],
  ];
  return <section className="studio-report" aria-label={copy.report_label}>
    <SectionHeading variant="ruled" title={copy.report} count={copy.progress(report.through, report.of)} />
    <dl>{rows.map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}</dl>
    <p className="cc-side-fine">{copy.chokepoints_hint} {copy.report_hint}</p>
  </section>;
}

function PastCard({ run, index }: { run: PastRun; index: number }) {
  return <li className="studio-past" data-verdict={run.kind}>
    <b>{copy.compare_run(index + 1)} · {copy.compare_board(run.columns, run.rows, run.tiles)}{run.edited > 0 && ` · ${copy.edited_row}`}</b>
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

type Line = Readonly<{
  key: string; label: string; note: string; verdict: string; kind: string; last_change: number; board: StudioBoard;
  mini: string; current: boolean; on_use?: () => void; use_label: string; current_word: string; sweep: Sweep;
}>;

/** One comparison table, shared by sizes and crowds: a mini end-state board, the verdict, and a Use button.
 * Hook-free, and called directly by its two wrappers, so a test can walk the whole tree. */
function CompareTable({ className, title, label, summary, first, lines, on_clear }: {
  className: string; title: string; label: string; summary: string; first: string; lines: readonly Line[]; on_clear: () => void;
}) {
  return <section className={className} aria-label={label}>
    <SectionHeading variant="ruled" title={title} count={summary} />
    <table>
      <caption className="studio-visually-hidden">{label}</caption>
      <thead><tr><th scope="col">{first}</th><th scope="col">{copy.result_col}</th></tr></thead>
      <tbody>{lines.map(line => <tr key={line.key} data-verdict={line.kind} data-current={line.current}>
        <th scope="row"><MiniBoard board={line.board} label={line.mini} />
          <span>{line.label}</span><small>{line.note}</small></th>
        <td><b>{line.verdict}</b><small>{copy.size_last(line.last_change)}</small>
          <small className="studio-spread">{copy.spread_line(line.sweep.rounds, line.sweep.kinds.map(entry => [entry.kind, entry.count] as const))}</small>
          {line.on_use && (line.current ? <em>{line.current_word}</em>
            : <InkButton size="small" aria-label={line.use_label} onClick={line.on_use}>{copy.size_use_word}</InkButton>)}
        </td>
      </tr>)}</tbody>
    </table>
    <InkButton size="small" onClick={on_clear}>{copy.clear}</InkButton>
  </section>;
}

export function SizeTable({ sizes, current, on_size, on_clear }: {
  sizes: SizeCompare; current: string; on_size?: (id: string) => void; on_clear: () => void;
}) {
  const lines = sizes.rows.map((row): Line => ({ key: row.id, label: row.label, verdict: row.verdict, kind: row.kind,
    note: row.edited ? `${copy.size_tiles(row.tiles)} · ${copy.edited_row}` : copy.size_tiles(row.tiles),
    last_change: row.last_change, board: row.board, current: row.id === current, mini: copy.mini_label(row.verdict, row.columns, row.rows),
    use_label: copy.size_use(row.label), current_word: copy.size_current, sweep: row.sweep, ...(on_size ? { on_use: () => on_size(row.id) } : {}) }));
  return CompareTable({ className: 'studio-sizes', title: copy.compare_sizes, label: copy.sizes_label,
    summary: copy.summary(sizes.viewers, sizes.turns, sizes.seed), first: copy.size_col, lines, on_clear });
}

/** The same board at several crowd sizes. `viewers` is what the form holds now, so that row reads "In the form". */
export function CrowdTable({ crowds, viewers, on_viewers, on_clear }: {
  crowds: CrowdCompare; viewers: number; on_viewers?: (viewers: number) => void; on_clear: () => void;
}) {
  const lines = crowds.lines.map((row): Line => ({ key: String(row.viewers), label: copy.crowd_word(row.viewers),
    note: copy.compare_board(crowds.columns, crowds.rows, crowds.tiles), verdict: row.verdict, kind: row.kind,
    last_change: row.last_change, board: row.board, current: row.viewers === viewers,
    mini: copy.mini_label(row.verdict, crowds.columns, crowds.rows), use_label: copy.crowd_use(row.viewers),
    current_word: copy.crowd_on_form, sweep: row.sweep, ...(on_viewers ? { on_use: () => on_viewers(row.viewers) } : {}) }));
  return CompareTable({ className: 'studio-crowds', title: copy.compare_crowds, label: copy.crowds_label,
    summary: `${crowds.turns} turns · seed ${crowds.seed}${crowds.edited > 0 ? ` · ${copy.edited_row}` : ''}`,
    first: copy.crowd_col, lines, on_clear });
}

export function RehearseSide({ state, view, handlers, size = '', on_size }: {
  state: RehearseState; view: RehearseView; handlers: RehearseHandlers; size?: string; on_size?: (id: string) => void;
}) {
  const viewers = Number(state.inputs.viewers);
  return <div className="studio-rehearse-side">
    <VerdictBlock state={state} view={view} handlers={handlers} />
    {state.run && <TerritoryStrip run={state.run} shown={state.turn} />}
    <TurnLog state={state} board={view.shown} />
    {state.crowds && <CrowdTable crowds={state.crowds} viewers={viewers} on_clear={handlers.clear_crowds}
      on_viewers={count => handlers.input('viewers', String(count))} />}
    {state.sizes && <SizeTable sizes={state.sizes} current={size} {...(on_size ? { on_size } : {})} on_clear={handlers.clear_sizes} />}
    <BalanceTable view={view} />
    <ComparePast past={state.past} on_clear={handlers.clear_past} />
  </div>;
}
