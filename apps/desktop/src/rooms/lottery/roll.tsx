import type { ReactNode } from 'react';
import { ChamberSection } from '@castle-control/ui/chamber';
import type { CheckResult, LotsDraw } from '@castle-control/contract';
import { lotsCopy as copy } from '../../lots-copy.js';
import { capLine, cooldownLine, oddsLine, poolLabel } from './flow-model.js';

/** The chamber's calm readouts: the stage's panel, the live roll beside it and the current draw. */
export type RollTone = 'open' | 'draft' | 'sealed' | 'cast' | 'blocked';
const cohorts = ['new_account', 'subscriber', 'raider'] as const;
type Cohort = typeof cohorts[number];

export function StagePanel({ title, count, caption = copy.count_caption, draft = false, children }: {
  /** Undefined when the source cannot count the roll yet (the core counts it at the seal). */
  title: string; count: number | undefined; caption?: string; draft?: boolean; children: ReactNode;
}) {
  return <section className="cc-panel lottery-stage-panel" data-role="lot-urn-panel" aria-label={copy.pool_title} data-draft={draft || undefined}>
    <div className="cc-panel__head lottery-pool-heading">
      <h2 className="cc-panel__title" data-role="panel-title" title={title}>{title}</h2>
      <p className="lottery-count" data-role="lot-count"><b>{count ?? '—'}</b><span>{caption}</span></p>
    </div>
    <div className="lottery-stage">{children}</div>
  </section>;
}

export function RollPanel({ status, tone, counts, count, pending, draft = false, simulated = false, compact = false }: {
  status: string; tone: RollTone; counts?: Readonly<Record<Cohort, number>> | undefined; count?: number | undefined;
  /** Shown instead of an empty total when the count is not readable yet. */
  pending?: string | undefined; draft?: boolean; simulated?: boolean; compact?: boolean;
}) {
  return <ChamberSection title={copy.roll} aside={draft ? 'Draft · not sealed' : simulated ? <span className="cc-sim">Simulated</span> : undefined}>
    <div className="lottery-roll" data-role="lot-roll-panel" data-tone={tone}>
      <p className="lottery-roll-status" role="status"><i className="cc-lozenge" aria-hidden="true" />{status}</p>
      {counts && <div className="lottery-cohort-bar" aria-hidden="true">{cohorts.map(cohort =>
        <i key={cohort} data-cohort={cohort} style={{ flex: counts[cohort] }} />)}</div>}
      {!compact && counts && <RollLegend counts={counts} />}
      {count === undefined && pending ? <p className="lottery-roll-total lottery-roll-pending">{pending}</p>
        : <p className="lottery-roll-total"><b>{count ?? '—'}</b> lots · eligible</p>}
    </div>
  </ChamberSection>;
}

/** Cohort names and counts stay readable in the full roll inside the drawer. */
export function RollLegend({ counts }: { counts: Readonly<Record<Cohort, number>> }) {
  return <ul className="lottery-roll-legend" data-role="lot-legend" aria-label={copy.dots}>{cohorts.map(cohort =>
        <li key={cohort} data-cohort={cohort}><i className="cc-swatch" aria-hidden="true" />{copy.cohorts[cohort]} <b>{counts[cohort]}</b></li>)}</ul>;
}

const stamp: Record<CheckResult, string> = { ok: 'ok', warn: 'held', blocked: 'blocked' };
export function DrawCard({ name, line, guard, guard_word, guard_line, detail, children }: {
  name: string; line: string; guard?: CheckResult | undefined; guard_word?: string | undefined; guard_line?: string | undefined;
  /** Read-only summary under the line: the seats to fill and who can enter. */
  detail?: ReactNode; children?: ReactNode;
}) {
  return <div className="lottery-draw-card" data-role="lot-draw-card">
    <p className="cc-kicker">This draw</p>
    <h3 className="lottery-draw-name">{name}</h3>
    <p className="lottery-draw-line">{line}</p>
    {detail}
    {guard && <p className="lottery-draw-guard"><span className={`cc-stamp cc-stamp--${stamp[guard]}`}>{guard_word ?? copy.checks[guard]}</span>
      <span>{guard_line ?? copy.guardrails}</span></p>}
    {children && <div className="lottery-draw-actions">{children}</div>}
  </div>;
}

/** The winner seats as places at the table: empty until the cast, never naming anyone. */
export function DrawSeats({ count, filled }: { count: number; filled: number }) {
  const shown = Math.min(count, 8);
  return <div className="lottery-seats" data-role="lot-seats">
    <p className="lottery-seats-caption">{filled ? `${filled} of ${count} seats filled` : `${count} seat${count === 1 ? '' : 's'} to fill`}</p>
    <ol aria-hidden="true">
      {Array.from({ length: shown }, (_, index) => <li key={index} data-filled={index < filled || undefined}>{index + 1}</li>)}
      {count > shown && <li className="lottery-seats-more">+{count - shown}</li>}
    </ol>
  </div>;
}

/** Who can enter and how the odds fall, read from the draw's own rules. */
export function DrawFacts({ draw }: { draw: LotsDraw }) {
  return <dl className="lottery-facts" data-role="lot-facts">
    <div><dt>Who can enter</dt><dd>{poolLabel[draw.rules.pool.kind]}</dd></div>
    <div><dt>Odds</dt><dd>{oddsLine(draw)}</dd></div>
    <div><dt>Raiders</dt><dd>{capLine(draw)}</dd></div>
    <div><dt>Cooldown</dt><dd>{cooldownLine(draw.rules.cooldown_s)}</dd></div>
  </dl>;
}

/** The writ's road, read-only: where this draw stands between the seal and the proof. */
export function WritSteps({ sealed, started, proved, round }: { sealed: boolean; started: boolean; proved: boolean; round?: string | undefined }) {
  const steps = [
    { title: 'Seal the roll', detail: sealed ? 'Sealed · the roll is frozen' : 'Hold to seal freezes the eligible roll', done: sealed },
    { title: 'Public round', detail: round ?? (started ? 'Round arrived' : 'A future round is chosen at the seal'), done: started },
    { title: 'Cast and prove', detail: proved ? 'The writ is ready to check' : 'Winners follow the round; the writ proves them', done: proved },
  ];
  const current = steps.findIndex(step => !step.done);
  return <ol className="lottery-writ-steps" data-role="lot-writ-steps">
    {steps.map((step, index) => <li key={step.title} data-done={step.done || undefined} data-current={index === current || undefined}>
      <b>{step.title}</b><span>{step.detail}</span></li>)}
  </ol>;
}

export function countCohorts(entries: readonly { cohort?: Cohort | undefined }[]): Record<Cohort, number> {
  const counts: Record<Cohort, number> = { new_account: 0, subscriber: 0, raider: 0 };
  for (const entry of entries) if (entry.cohort) counts[entry.cohort] += 1;
  return counts;
}

/** Tools start expanded inside the detail drawer; their original grouping remains collapsible. */
export function MoreTools({ children, label = 'More · tools for this draw' }: { children: ReactNode; label?: string }) {
  return <details open className="cc-disclosure lottery-more" data-role="lot-more">
    <summary>{label}</summary>
    <div className="lottery-more-body">{children}</div>
  </details>;
}
