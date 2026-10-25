import './chips.css';

export const chipVariants = ['gules', 'azure', 'or', 'solid-gules', 'solid-azure', 'solid-or', 'solid', 'ok', 'bad', 'warn', 'dash'] as const;
export type ChipVariant = typeof chipVariants[number];

export function StatusChip({ variant, children }: { variant: ChipVariant; children: string }) {
  return <span className="cc-chip" data-variant={variant}>{children}</span>;
}

export const verdicts = ['pass', 'hold', 'bar'] as const;
export type Verdict = typeof verdicts[number];
const verdictLabels = { pass: 'Pass', hold: 'Hold', bar: 'Bar' } as const;
const verdictDescriptions = { pass: 'Released', hold: 'Held for review', bar: 'Removed' } as const;

export function VerdictChip({ verdict }: { verdict: Verdict }) {
  return <span className="cc-verdict" data-verdict={verdict} title={verdictDescriptions[verdict]}>
    <svg viewBox="0 0 20 20" aria-hidden="true">
      {verdict === 'pass' ? <path d="m4 10 4 4 8-9" />
        : verdict === 'hold' ? <path d="M7 4v12M13 4v12" /> : <path d="m5 5 10 10M15 5 5 15" />}
    </svg>{verdictLabels[verdict]}
  </span>;
}

export function GatehouseChip({ armed, watching, shield, href }: {
  armed: number; watching: number; shield: boolean; href: string;
}) {
  return <a className="cc-gatehouse" href={href} data-shield={shield}
    aria-label={`Moderator: ${armed} rules armed (they act), ${watching} watching (shadow: reports only). ${shield ? 'Bridge up: Shield Mode is on.' : 'Open the Gatehouse.'}`}>
    {shield && <span className="cc-gatehouse-shield">Bridge up</span>}
    {armed > 0 && <span className="cc-gatehouse-armed">Armed <b>{armed}</b></span>}
    {(watching > 0 || armed === 0) && <span className="cc-gatehouse-watching">Watching <b>{watching}</b></span>}
  </a>;
}

export type ConnectionState = 'connected' | 'reconnecting' | 'down';
export function ConnectionMark({ name, state }: { name: 'Twitch' | 'OBS'; state: ConnectionState }) {
  const text = state === 'down' ? 'disconnected' : state;
  return <div className="cc-connection" data-state={state} aria-label={`${name}: ${text}`}>
    <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="5.2" />
      <path d="M10 1v18M1 10h18" />{state === 'connected' && <path className="cc-connection-cross" d="M10 7v6M7 10h6" />}
    </svg><span><b>{name}</b><small>{text}</small></span>
  </div>;
}
