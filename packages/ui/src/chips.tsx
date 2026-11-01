import './chips.css';
import { Stamp } from './stamp/stamp.jsx';

export const chipVariants = ['gules', 'azure', 'or', 'solid-gules', 'solid-azure', 'solid-or', 'solid', 'ok', 'bad', 'warn', 'dash'] as const;
export type ChipVariant = typeof chipVariants[number];

export type StatusChipProps = {
  variant: ChipVariant; children: string;
};
export function StatusChip({ variant, children }: StatusChipProps) {
  return <span className="cc-chip" data-variant={variant}>{children}</span>;
}

export const verdicts = ['pass', 'hold', 'bar'] as const;
export type Verdict = typeof verdicts[number];
const verdictLabels = { pass: 'Pass', hold: 'Hold', bar: 'Bar' } as const;
const verdictDescriptions = { pass: 'Released', hold: 'Held for review', bar: 'Removed' } as const;

export function VerdictChip({ verdict }: { verdict: Verdict }) {
  return <span className="cc-verdict" data-verdict={verdict} title={verdictDescriptions[verdict]}>
    <Stamp kind={verdict === 'pass' ? 'pass' : verdict === 'hold' ? 'held' : 'blocked'} word={verdictLabels[verdict]} />
  </span>;
}

export function GatehouseChip({ armed, watching, shield, href }: {
  armed: number; watching: number; shield: boolean; href: string;
}) {
  return <a className="cc-gatehouse" href={href} data-shield={shield}
    aria-label={`Moderator: ${armed} rules armed (they act), ${watching} watching (shadow: reports only). ${shield ? 'Bridge up: Shield Mode is on.' : 'Open the Gatehouse.'}`}>
    {shield && <span className="cc-gatehouse-shield">Bridge up</span>}
    {armed > 0 && <Stamp kind="armed" word={`Armed ${armed}`} />}
    {(watching > 0 || armed === 0) && <Stamp kind="shadow" word={`Watching ${watching}`} />}
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
