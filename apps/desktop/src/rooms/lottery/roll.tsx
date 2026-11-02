import type { ReactNode } from 'react';
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

export function RollPanel({ status, tone, counts, winners, winner_detail, held_out, cap, draft = false, simulated = false, children }: {
  status: string; tone: RollTone; counts?: Readonly<Record<Cohort, number>> | undefined; winners: ReactNode; winner_detail: string;
  held_out: ReactNode; cap: string; draft?: boolean; simulated?: boolean; children?: ReactNode;
}) {
  return <section className="cc-panel lottery-roll" data-role="lot-roll-panel" aria-label={copy.roll} data-tone={tone}>
    <div className="cc-panel__head">
      <h2 className="cc-panel__title">{copy.roll}</h2>
      {draft ? <span className="cc-stamp cc-stamp--draft">Draft · not sealed</span> : simulated ? <span className="cc-sim">Simulated</span> : null}
    </div>
    <div className="cc-panel__body lottery-roll-body">
      <p className="lottery-roll-status" role="status"><i className="cc-lozenge" aria-hidden="true" />{status}</p>
      {counts && <ul className="lottery-roll-legend" data-role="lot-legend" aria-label={copy.dots}>{cohorts.map(cohort =>
        <li key={cohort} data-cohort={cohort}><i className="cc-swatch" aria-hidden="true" />{copy.cohorts[cohort]} <b>{counts[cohort]}</b></li>)}</ul>}
      <ul className="lottery-roll-figs" aria-label="Headline figures">{[
        { value: winners, label: copy.winners, detail: winner_detail, wide: false },
        { value: held_out, label: copy.held_out, detail: copy.by_cooldown, wide: false },
        { value: cap, label: copy.raider_cap, detail: copy.of_winners, wide: true },
      ].map(stat => <li className="cc-readout cc-readout--jewel" data-role="lot-stat" key={stat.label}>
        <span className={`cc-jewel${stat.wide ? ' cc-jewel--wide' : ''}`}>{stat.value}</span>
        <span className="cc-readout__label">{stat.label}</span><span className="cc-readout__sub">{stat.detail}</span>
      </li>)}</ul>
      {children}
    </div>
  </section>;
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

/** Rarely used tools sit behind one disclosure under the hall. */
export function MoreTools({ children, label = 'More · tools for this draw' }: { children: ReactNode; label?: string }) {
  return <details className="cc-disclosure lottery-more" data-role="lot-more">
    <summary>{label}</summary>
    <div className="lottery-more-body">{children}</div>
  </details>;
}
