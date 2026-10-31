import { InkButton } from '@castle-control/ui';

/** Pure leaf: fixture rooms cannot expose a live source capability. */
export function VoteBarSourceAction({ mode, busy, on_copy }: {
  mode: 'core' | 'fixture'; busy: boolean; on_copy: () => void;
}) {
  return mode === 'core' ? <InkButton disabled={busy} onClick={on_copy}>
    Copy vote-bar browser source URL
  </InkButton> : null;
}
