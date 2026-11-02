import { useSyncExternalStore } from 'react';
import { SAMPLE } from '@castle-control/duel';
import { duelHost } from '../rooms/studio/duel-host.js';
import { roundName } from '../rooms/studio/duel-model.js';
import type { DuelPicture } from '../rooms/studio/duel-model.js';

/**
 * The overview's Map Room tile: a small duel card (two contestants and chat's share bar),
 * read from the duel the Map Room last showed. Before the stage has mounted it shows the
 * sample mill question's first match with illustrative shares, marked SIMULATED.
 */
export type DuelCard = { round: string; left: string; right: string; share: number; simulated: boolean; illustrative: boolean };

const [first, , , fourth] = SAMPLE.chat.items;
export const sampleDuelCard: DuelCard = {
  round: 'Semifinal', left: first?.title ?? 'Left', right: fourth?.title ?? 'Right', share: 0.58, simulated: true, illustrative: true,
};

/** No picture yet: fixture mode shows the labelled sample match; core mode never borrows it (returns undefined). */
export function duelCard(picture: DuelPicture | undefined, sample = true): DuelCard | undefined {
  if (!picture) return sample ? sampleDuelCard : undefined;
  if (!picture.left || !picture.right || picture.phase === 'empty' || picture.phase === 'called_off') return undefined;
  const total = picture.counts[0] + picture.counts[1];
  const size = picture.rounds[0]?.length ? picture.rounds[0].length * 2 : 2;
  return { round: roundName(size, picture.round), left: picture.left.title, right: picture.right.title,
    share: total ? picture.counts[0] / total : 0.5, simulated: picture.simulated, illustrative: false };
}

/** `null` is no duel running; leaving `card` out follows the Map Room's last picture live. */
/** `simulated` marks the card when the session itself is simulated (a dress rehearsal), whatever the duel reports. */
export function DuelTile({ card, sample = true, simulated = false }: { card?: DuelCard | null; sample?: boolean; simulated?: boolean }) {
  const picture = useSyncExternalStore(duelHost.subscribe, duelHost.picture, duelHost.picture);
  const shown = card === undefined ? duelCard(picture, sample) ?? null : card;
  if (!shown) return <span className="overview-duel" data-empty="true"><span className="overview-duel__round">{!sample && !picture ? 'No duel read yet' : 'No duel running'}</span></span>;
  return <DuelCardView card={simulated && !shown.simulated ? { ...shown, simulated: true } : shown} />;
}

function DuelCardView({ card }: { card: DuelCard }) {
  const left = Math.round(card.share * 100);
  return <span className="overview-duel" role="img" aria-label={`Chat duel, ${card.round}: ${card.left} ${left}%, ${card.right} ${100 - left}%`}>
    <span className="overview-duel__round">{card.round}{card.simulated && <span className="cc-sim">Simulated</span>}</span>
    <span className="overview-duel__pair"><b>{card.left}</b><i aria-hidden="true">vs</i><b>{card.right}</b></span>
    <span className="overview-duel__bar" aria-hidden="true"><span style={{ width: `${left}%` }} /></span>
    <span className="overview-duel__share"><span>{left}%</span><span>{100 - left}%</span></span>
    {card.illustrative && <span className="overview-duel__note">Illustrative shares · sample contestants</span>}
  </span>;
}
