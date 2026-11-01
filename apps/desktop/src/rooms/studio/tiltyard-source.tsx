import { InkButton } from '@castle-control/ui';

/** Fixture rooms cannot expose a live source capability. Matches VoteBarSourceAction. */
export function DuelSourceAction({ mode, busy, on_copy }: {
  mode: 'core' | 'fixture'; busy: boolean; on_copy: () => void;
}) {
  return mode === 'core' ? <InkButton disabled={busy} onClick={on_copy}>Duel on stream · Copy browser source URL</InkButton> : null;
}
