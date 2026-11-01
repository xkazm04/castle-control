import { useId } from 'react';
import { arms, BACKING_PATH, chargePath, divisionPath, SHIELD_PATH } from '@castle-control/duel';
import type { DuelItem, Ink } from '@castle-control/duel';
import type { TiltyardWords } from './words.js';

const inks: Readonly<Record<Ink, string>> = {
  gules: 'var(--gules)', azure: 'var(--azure)', or: 'var(--or)',
  sable: 'var(--ty-parchment-ink)', argent: 'var(--ty-parchment-top)', vert: 'var(--ty-arms-vert)',
};
export function Shield({ item, words }: { item: Omit<DuelItem, 'id'> & { readonly id: string }; words: TiltyardWords }) {
  const suffix = useId();
  const clip_id = `ty-shield-${item.id}-${suffix}`;
  const data = arms(item.title);
  const division = divisionPath(data.division);
  return <svg className="ty-shield" viewBox="0 0 100 120" role="img" aria-label={words.arms_label(item.title)}>
    <defs><clipPath id={clip_id}><path d={SHIELD_PATH} /></clipPath></defs>
    <g clipPath={`url(#${clip_id})`}>
      <rect width="100" height="120" data-ink={data.field} fill={inks[data.field]} />
      {division && <path d={division} data-ink={data.second} fill={inks[data.second]} />}
    </g>
    {data.backing && <path d={BACKING_PATH} data-ink={data.field} fill={inks[data.field]} stroke={inks.sable} strokeWidth="1.6" />}
    <path d={chargePath(data.charge)} data-ink={data.charge_ink} fill={inks[data.charge_ink]} stroke={inks.sable} strokeWidth="1.6" strokeLinejoin="round" />
    <path d={SHIELD_PATH} fill="none" stroke={inks.sable} strokeWidth="4" strokeLinejoin="round" />
  </svg>;
}
