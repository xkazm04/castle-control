import type { ReactNode } from 'react';
import { ChamberSection } from '@castle-control/ui/chamber';
import type { CheckResult } from '@castle-control/contract';
import { lotsCopy as copy } from '../../lots-copy.js';

/** The chamber's calm readouts: the stage's panel, the live roll beside it and the current draw. */
export type RollTone = 'open' | 'draft' | 'sealed' | 'cast' | 'blocked';
const cohorts = ['new_account', 'subscriber', 'raider'] as const;
type Cohort = typeof cohorts[number];

export function StagePanel({ title, count, caption = copy.count_caption, draft = false, children }: {
  title: string; count: number; caption?: string; draft?: boolean; children: ReactNode;
}) {
  return <section className="cc-panel lottery-stage-panel" data-role="lot-urn-panel" aria-label={copy.pool_title} data-draft={draft || undefined}>
    <div className="cc-panel__head lottery-pool-heading">
      <h2 className="cc-panel__title" data-role="panel-title" title={title}>{title}</h2>
      <p className="lottery-count" data-role="lot-count"><b>{count}</b><span>{caption}</span></p>
    </div>
    <div className="lottery-stage">{children}</div>
  </section>;
}

export function RollPanel({ status, tone, counts, count, draft = false, simulated = false, compact = false }: {
  status: string; tone: RollTone; counts?: Readonly<Record<Cohort, number>> | undefined; count?: number | undefined;
  draft?: boolean; simulated?: boolean; compact?: boolean;
}) {
  return <ChamberSection title={copy.roll} aside={draft ? 'Draft · not sealed' : simulated ? <span className="cc-sim">Simulated</span> : undefined}>
    <div className="lottery-roll" data-role="lot-roll-panel" data-tone={tone}>
      <p className="lottery-roll-status" role="status"><i className="cc-lozenge" aria-hidden="true" />{status}</p>
      {counts && <div className="lottery-cohort-bar" aria-hidden="true">{cohorts.map(cohort =>
        <i key={cohort} data-cohort={cohort} style={{ flex: counts[cohort] }} />)}</div>}
      {!compact && counts && <RollLegend counts={counts} />}
      <p className="lottery-roll-total"><b>{count ?? '—'}</b> lots · eligible</p>
    </div>
  </ChamberSection>;
}

/** Cohort names and counts stay readable in the full roll inside the drawer. */
export function RollLegend({ counts }: { counts: Readonly<Record<Cohort, number>> }) {
  return <ul className="lottery-roll-legend" data-role="lot-legend" aria-label={copy.dots}>{cohorts.map(cohort =>
        <li key={cohort} data-cohort={cohort}><i className="cc-swatch" aria-hidden="true" />{copy.cohorts[cohort]} <b>{counts[cohort]}</b></li>)}</ul>;
}

const stamp: Record<CheckResult, string> = { ok: 'ok', warn: 'held', blocked: 'blocked' };
export function DrawCard({ name, line, guard, guard_word, guard_line, children }: {
  name: string; line: string; guard?: CheckResult | undefined; guard_word?: string | undefined; guard_line?: string | undefined; children?: ReactNode;
}) {
  return <div className="lottery-draw-card" data-role="lot-draw-card">
    <p className="cc-kicker">This draw</p>
    <h3 className="lottery-draw-name">{name}</h3>
    <p className="lottery-draw-line">{line}</p>
    {guard && <p className="lottery-draw-guard"><span className={`cc-stamp cc-stamp--${stamp[guard]}`}>{guard_word ?? copy.checks[guard]}</span>
      <span>{guard_line ?? copy.guardrails}</span></p>}
    {children && <div className="lottery-draw-actions">{children}</div>}
  </div>;
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
