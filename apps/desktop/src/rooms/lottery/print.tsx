import type { ReactNode } from 'react';
import { entranceStyle, NumberedDiscs } from '@castle-control/ui';
import { lotsCopy as copy } from '../../lots-copy.js';

export function PanelTitle({ title, gloss, children }: { title: string; gloss?: ReactNode; children?: ReactNode }) {
  return <h3 data-role="panel-title">{title}{gloss && <em data-role="panel-gloss">{gloss}</em>}{children}</h3>;
}

export function Ticket({ label, stub = copy.writ_stub, writ = false, state, children, entrance = 7 }: {
  label: string; stub?: string; writ?: boolean; state?: string; children: ReactNode; entrance?: number;
}) {
  return <article className={`cc-ticket${writ ? ' cc-writ' : ''} panel cc-print-in`} style={entranceStyle(entrance)} data-state={state} aria-label={label}>
    <div className="cc-ticket-stub" aria-hidden="true"><b>{stub}</b></div>
    <div className="cc-ticket-body">{children}</div>
  </article>;
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
