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

export function duelCard(picture: DuelPicture | undefined): DuelCard | undefined {
  if (!picture) return sampleDuelCard;
  if (!picture.left || !picture.right || picture.phase === 'empty' || picture.phase === 'called_off') return undefined;
  const total = picture.counts[0] + picture.counts[1];
  const size = picture.rounds[0]?.length ? picture.rounds[0].length * 2 : 2;
  return { round: roundName(size, picture.round), left: picture.left.title, right: picture.right.title,
    share: total ? picture.counts[0] / total : 0.5, simulated: picture.simulated, illustrative: false };
}

/** `null` is no duel running; leaving `card` out reads the Map Room's last picture. */
export function DuelTile({ card = duelCard(duelHost.picture()) ?? null }: { card?: DuelCard | null }) {
  if (!card) return <span className="overview-duel" data-empty="true"><span className="overview-duel__round">No duel running</span></span>;
  const left = Math.round(card.share * 100);
  return <span className="overview-duel" role="img" aria-label={`Chat duel, ${card.round}: ${card.left} ${left}%, ${card.right} ${100 - left}%`}>
    <span className="overview-duel__round">{card.round}{card.simulated && <span className="cc-sim">Simulated</span>}</span>
    <span className="overview-duel__pair"><b>{card.left}</b><i aria-hidden="true">vs</i><b>{card.right}</b></span>
    <span className="overview-duel__bar" aria-hidden="true"><span style={{ width: `${left}%` }} /></span>
    <span className="overview-duel__share"><span>{left}%</span><span>{100 - left}%</span></span>
    {card.illustrative && <span className="overview-duel__note">Illustrative shares · sample contestants</span>}
  </span>;
}
