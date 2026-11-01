import type { ReactNode } from 'react';
import { entranceStyle, HeroReadout, NumberedDiscs, Ribbon, Stamp } from '@castle-control/ui';
import type { CheckResult } from '@castle-control/contract';
import { lotsCopy as copy } from '../../lots-copy.js';

export function PanelTitle({ title, gloss, children }: { title: string; gloss?: ReactNode; children?: ReactNode }) {
  return <h3 data-role="panel-title">{title}{gloss && <em data-role="panel-gloss">{gloss}</em>}{children}</h3>;
}

export function PolicyStamp({ result }: { result: CheckResult }) {
  return <Stamp kind={result === 'warn' ? 'held' : result} word={copy.checks[result]} />;
}

export function WritHeading({ awaiting, frozen }: { awaiting: boolean; frozen: boolean }) {
  return <PanelTitle title={copy.writ} gloss={copy.writ_gloss}>
    <span className="lottery-heading-stamp"><Stamp kind={awaiting ? 'draft' : frozen ? 'sealed' : 'simulated'}
      word={awaiting ? copy.awaiting : frozen ? copy.frozen_stamp : copy.waiting} /></span>
  </PanelTitle>;
}

export function DeskBody({ children }: { children: ReactNode }) {
  return <><div className="lottery-desk-body" role="region" aria-label={copy.desk_contents} tabIndex={0}>
    {children}
  </div><p className="lottery-scroll-cue">{copy.desk_scroll} <span aria-hidden="true">↓</span></p></>;
}

export function PoolStage({ count, winners, winner_detail, held_out, cap, illustration, children, foot, caption = copy.count_caption, title = copy.urn_title }: {
  count: number; winners: ReactNode; winner_detail: string; held_out: ReactNode; cap: string;
  illustration: ReactNode; children: ReactNode; foot: ReactNode; caption?: string; title?: string;
}) {
  return <div className="cc-stage-wrap"><section className="panel cc-print-in" data-role="lot-urn-panel" style={entranceStyle(0)} aria-label={copy.pool_title}>
    <div className="topline" />
    <div className="lottery-pool-heading" title={title}>
      <PanelTitle title={title} gloss={illustration} />
      <div className="cc-tally">
        <div className="num" data-role="lot-count"><HeroReadout value={String(count)} caption={caption}
          ink="gules" scale="numeric" ghost="shadow" /></div>
      </div>
    </div>
    <div className="lottery-stage">{children}</div>
    <div className="lottery-pool-readings">
      <div className="cc-stage-foot">{foot}</div>
      <ul className="statrow">{[
        { value: winners, label: copy.winners, detail: winner_detail },
        { value: held_out, label: copy.held_out, detail: copy.by_cooldown },
        { value: cap, label: copy.raider_cap, detail: copy.of_winners },
      ].map(stat => <li className="stat" data-role="lot-stat" key={stat.label}>
        <span className="ring">{stat.value}</span><span title={stat.detail}><b>{stat.label}</b><small>{stat.detail}</small></span>
      </li>)}</ul>
    </div>
  </section></div>;
}

export function Ticket({ label, stub = copy.writ_stub, writ = false, state, children, entrance = 7 }: {
  label: string; stub?: string; writ?: boolean; state?: string; children: ReactNode; entrance?: number;
}) {
  return <article className={`cc-ticket${writ ? ' cc-writ' : ''} panel cc-print-in`} style={entranceStyle(entrance)} data-state={state} aria-label={label}>
    <div className="cc-ticket-stub" aria-hidden="true"><b>{stub}</b></div>
    <div className="cc-ticket-body">{children}</div>
  </article>;
}

export function PolicyRibbon({ result, core = false }: { result: CheckResult; core?: boolean }) {
  return <div className="lottery-policy panel cc-print-in" style={entranceStyle(core ? 3 : 5)}>
    <Ribbon label={copy.guardrails} word={copy.checks[result]} {...(!core ? { note: copy.local_preview } : {})}
      signal={result === 'blocked' ? 'danger' : result === 'warn' ? 'warn' : 'ok'} />
  </div>;
}

export function policyReason(reason: string): string {
  return copy.reasons[reason as keyof typeof copy.reasons] ?? reason;
}

export function FairnessSteps({ simulated = false }: { simulated?: boolean }) {
  return <section className="cc-group panel body15 cc-print-in" style={entranceStyle(10)} aria-label={copy.fairness}>
    <p className="cc-kicker">{copy.fairness}</p>
    <NumberedDiscs items={copy.steps.map(([title, description]) => ({ id: title, title, description }))} />
    {simulated && <><p className="cc-aside">{copy.test_note}</p><p className="cc-aside">{copy.fixture_only}</p></>}
  </section>;
}
