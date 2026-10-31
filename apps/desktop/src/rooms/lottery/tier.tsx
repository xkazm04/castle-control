import { HeraldicCard, InkButton } from '@castle-control/ui';
import type { LotsDraw } from '@castle-control/contract';
import { OVERLORD_URN_TEMPLATE } from '@castle-control/renderer';
import type { DrawShape } from '@castle-control/renderer';
import { lotsCopy as copy } from '../../lots-copy.js';
import './tier.css';

/** The plan's three room counts; the fourth (xl) shares the upper count, so it is not offered twice. */
const tiers = ['s', 'm', 'l'] as const;

/** One-click Overlord urn: configures shape and winner count BEFORE sealing; never touches a cast. */
export function UrnTierPreset({ draw, shape, on_edit, on_shape, entry_count, disabled = false }: {
  draw: LotsDraw; shape: DrawShape; on_edit: (draw: LotsDraw) => void; on_shape: (shape: DrawShape) => void;
  entry_count?: number; disabled?: boolean;
}) {
  const counts = OVERLORD_URN_TEMPLATE.winner_count_by_tier;
  return <HeraldicCard variant="raised" aria-label={copy.tier.title}>
    <h2 className="lottery-card-title">{copy.tier.title}</h2>
    <div className="lottery-tier-buttons" role="group" aria-label={copy.tier.title}>
      {tiers.map(tier => {
        const count = counts[tier];
        const active = shape === OVERLORD_URN_TEMPLATE.shape && draw.rules.winner_count === count;
        return <InkButton key={tier} size="small" data-tier={tier} aria-pressed={active}
          disabled={disabled || (entry_count !== undefined && count > entry_count)}
          onClick={() => {
            on_shape(OVERLORD_URN_TEMPLATE.shape);
            if (draw.rules.winner_count !== count) on_edit({ ...draw, rules: { ...draw.rules, winner_count: count } });
          }}>
          <b>{copy.tier.sizes[tier]}</b><span>{copy.tier.rooms[tier]}</span><small>{copy.tier.count(count)}</small>
        </InkButton>;
      })}
    </div>
    <p className="cc-aside">{copy.tier.hint}</p>
  </HeraldicCard>;
}
