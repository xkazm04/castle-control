import type { Verdict } from '@castle-control/contract';
import { Pennant, VerdictChip } from '@castle-control/ui';
import { moderationCopy as copy } from '../../moderation-copy.js';

export const verdictWords = { all: copy.all, pass: copy.pass, hold: copy.hold, bar: copy.bar } as const;

/** UTC remains the wire value; only the visible clock follows the host zone. */
export function ClockTime({ at }: { at: string }) {
  const clock = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  return <time dateTime={at} title={at}>{clock.format(new Date(at))}</time>;
}

export function VerdictIcon({ verdict }: { verdict: Verdict | 'all' }) {
  return <svg viewBox="0 0 20 20" aria-hidden="true">
    {verdict === 'pass' ? <path d="m4 10 4 4 8-9" /> : verdict === 'hold' ? <path d="M7 4v12M13 4v12" />
      : verdict === 'bar' ? <path d="m5 5 10 10M15 5 5 15" /> : <path d="M3 5h14M3 10h14M3 15h14" />}
  </svg>;
}

/** The kit pennant owns the word; the icon remains decorative beside it. */
export function VerdictMark({ verdict }: { verdict: Verdict }) {
  return <span className="moderator-verdict-mark" data-verdict={verdict}>
    <Pennant word={verdictWords[verdict]} ink={verdict === 'bar' ? 'gules' : 'or'}
      {...(verdict === 'pass' ? { style: { '--cc-ink': 'transparent' } } : {})} />
    <VerdictIcon verdict={verdict} />
  </span>;
}

export function ReviewMeta({ verdict, id, status }: { verdict: Verdict; id: string; status: string }) {
  return <div className="moderator-review-meta"><VerdictChip verdict={verdict} /><code>{id}</code><em>{status}</em></div>;
}

export function CountLabel({ first, second }: { first: string; second?: string }) {
  return <small className="moderator-count-label"><span>{first}</span>{second && <span>{second}</span>}</small>;
}
