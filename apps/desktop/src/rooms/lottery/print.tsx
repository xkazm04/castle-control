import type { ReactNode } from 'react';
import { HeroReadout, Medal, MedalList, NumberedDiscs, Ribbon, StageFrame } from '@castle-control/ui';
import type { CheckResult } from '@castle-control/contract';
import { lotsCopy as copy } from '../../lots-copy.js';

export function PoolStage({ count, winners, winner_detail, held_out, cap, illustration, children, foot, caption = copy.entries, title = copy.urn_title }: {
  count: number; winners: ReactNode; winner_detail: string; held_out: ReactNode; cap: string;
  illustration: string; children: ReactNode; foot: ReactNode; caption?: string; title?: string;
}) {
  return <div className="cc-stage-wrap">
    <StageFrame className="lottery-stage" ink="gules" aria-label={copy.pool_title}>
      <header className="cc-stage-kicker"><h2>{title}</h2><p>{illustration}</p></header>
      <div className="cc-tally">
        <HeroReadout value={String(count)} caption={caption} ink="gules" scale="viewport" ghost="overprint" />
        <MedalList>
          <Medal value={winners} label={copy.winners} detail={winner_detail} ink="gules" />
          <Medal value={held_out} label={copy.held_out} detail={copy.by_cooldown} ink="gules" />
          <Medal value={cap} label={copy.raider_cap} detail={copy.of_winners} ink="gules" />
        </MedalList>
      </div>
      {children}
      <figcaption className="cc-stage-foot">{foot}</figcaption>
    </StageFrame>
  </div>;
}

export function Ticket({ label, stub = copy.writ_stub, writ = false, state, children }: {
  label: string; stub?: string; writ?: boolean; state?: string; children: ReactNode;
}) {
  return <article className={`cc-ticket${writ ? ' cc-writ' : ''}`} data-state={state} aria-label={label}>
    <div className="cc-ticket-stub" aria-hidden="true"><b>{stub}</b></div>
    <div className="cc-ticket-body">{children}</div>
  </article>;
}

export function PolicyRibbon({ result, core = false }: { result: CheckResult; core?: boolean }) {
  return <Ribbon label={copy.guardrails} word={copy.checks[result]} {...(!core ? { note: copy.local_preview } : {})}
    signal={result === 'blocked' ? 'danger' : result === 'warn' ? 'warn' : 'ok'} />;
}

export function policyReason(reason: string): string {
  return copy.reasons[reason as keyof typeof copy.reasons] ?? reason;
}

export function FairnessSteps({ simulated = false }: { simulated?: boolean }) {
  return <section className="cc-group" aria-label={copy.fairness}>
    <p className="cc-kicker">{copy.fairness}</p>
    <NumberedDiscs items={copy.steps.map(([title, description]) => ({ id: title, title, description }))} />
    {simulated && <><p className="cc-aside">{copy.test_note}</p><p className="cc-aside">{copy.fixture_only}</p></>}
  </section>;
}
