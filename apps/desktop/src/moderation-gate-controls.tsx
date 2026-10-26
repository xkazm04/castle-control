import { InkButton } from '@castle-control/ui';
import type { ModerationPort, ModerationPreview } from './moderation-model.js';
import { moderationCopy as copy } from './moderation-copy.js';

type GateProps = { snapshot: ModerationPreview; send: ModerationPort['send'] };

export function ShieldControl({ snapshot, send }: GateProps) {
  return <InkButton size="small" aria-label={copy.shield_label} aria-pressed={snapshot.shield} disabled={snapshot.shield_pending}
    variant={snapshot.shield ? 'danger' : 'outline'} onClick={() => send({ kind: 'shield' })}>
    {snapshot.shield ? copy.shield_on : copy.shield}
  </InkButton>;
}

export function GateControls({ snapshot, send }: GateProps) {
  const pending = snapshot.delay_pending || snapshot.shield_pending;
  return <div className="moderation-gate-controls" aria-busy={pending}>
    <label>{copy.delay_applied}
      <select aria-label={copy.delay_applied} value={snapshot.delay_s} disabled={snapshot.delay_pending}
        onChange={event => {
          const value = Number(event.currentTarget.value);
          if (value === 0 || value === 2 || value === 4 || value === 6) send({ kind: 'delay', delay_s: value });
        }}>
        <option value="0">{copy.delay_off}</option><option value="2">{copy.delay_seconds(2)}</option>
        <option value="4">{copy.delay_seconds(4)}</option><option value="6">{copy.delay_seconds(6)}</option>
      </select>
    </label>
    <p className="moderation-meta" role="status">{pending ? copy.gate_pending : copy.shield_label}</p>
  </div>;
}
