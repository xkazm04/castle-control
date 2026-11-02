import type { ModuleId } from '@castle-control/ui';
import { KeyBadge } from '@castle-control/ui/chamber';

export type DuelKey = 'enter' | 'undo' | 'speed' | 'reset';
type RoomAction = { action: string; key: string; label: string } & ({ flow: string } | { command: 'release' | 'remove' | 'ban' | 'dismiss' | 'shield' } | { duel: DuelKey } | { beacon: number } | { drawer: 'bracket' });
/** Winner letters; room-private controls resume their matching guarded flow. */
export const roomDeck: Readonly<Record<ModuleId, readonly RoomAction[]>> = {
  lottery: [
    { action: 'setup', key: 'Q', label: 'set up a draw', flow: 'lots-setup' },
    { action: 'cast', key: 'W', label: 'cast the lots', flow: 'lots-cast' },
    { action: 'prove', key: 'E', label: 'prove it · writ', flow: 'lots-prove' },
    { action: 'reveal', key: 'R', label: 'reveal next · cast setup', flow: 'lots-cast' },
    { action: 'by_hand', key: 'G', label: 'reveal by hand · cast setup', flow: 'lots-cast' },
    { action: 'sound', key: 'H', label: 'ceremony sound · cast setup', flow: 'lots-cast' },
    { action: 'tools', key: 'T', label: 'tools · draw setup', flow: 'lots-setup' },
    { action: 'info', key: 'I', label: 'about the writ', flow: 'lots-prove' },
    { action: 'winners', key: 'A', label: 'winners · draw setup', flow: 'lots-setup' },
    { action: 'held_out', key: 'S', label: 'entry pool · draw setup', flow: 'lots-setup' },
    { action: 'cap', key: 'D', label: 'raider cap · draw setup', flow: 'lots-setup' },
    { action: 'ceremony', key: 'F', label: 'ceremony · draw setup', flow: 'lots-setup' },
  ],
  moderator: [
    { action: 'release', key: 'Q', label: 'propose pass', command: 'release' },
    { action: 'remove', key: 'W', label: 'propose bar', command: 'remove' },
    { action: 'ban', key: 'E', label: 'propose ban', command: 'ban' },
    { action: 'dismiss', key: 'R', label: 'propose dismiss', command: 'dismiss' },
    { action: 'shield', key: 'T', label: 'raise / lower the drawbridge', command: 'shield' },
    { action: 'vote_bar', key: 'A', label: 'show the vote bar', flow: 'gatehouse-votebar' },
    { action: 'rules', key: 'G', label: 'set the rules', flow: 'gatehouse-rules' },
    { action: 'restyle', key: 'D', label: 'restyle · vote bar', flow: 'gatehouse-votebar' },
    { action: 'custom', key: 'F', label: 'custom look · vote bar', flow: 'gatehouse-votebar' },
    { action: 'filter', key: 'S', label: 'Herald filter · vote bar', flow: 'gatehouse-votebar' },
  ],
  visuals: [
    { action: 'tune', key: 'A', label: 'tune a beacon', flow: 'visuals-tune' },
    { action: 'beacon_0', key: 'Q', label: 'beacon 1', beacon: 0 },
    { action: 'beacon_1', key: 'W', label: 'beacon 2', beacon: 1 },
    { action: 'beacon_2', key: 'E', label: 'beacon 3', beacon: 2 },
    { action: 'test', key: 'S', label: 'test fire', flow: 'visuals-test-fire' },
    { action: 'replay', key: 'D', label: 'replay a night', flow: 'visuals-replay' },
    { action: 'decay', key: 'F', label: 'decay · tuning', flow: 'visuals-tune' },
  ],
  studio: [
    { action: 'enter', key: 'Enter', label: 'open / advance the vote', duel: 'enter' },
    { action: 'undo', key: 'Backspace', label: 'undo last call', duel: 'undo' },
    { action: 'stream', key: 'Q', label: 'show the duel on stream', flow: 'studio-duel-stream' },
    { action: 'speed', key: 'W', label: 'speed ×3', duel: 'speed' },
    { action: 'reset', key: 'E', label: 'new bracket', duel: 'reset' },
    { action: 'bracket', key: 'R', label: 'full bracket', drawer: 'bracket' },
    { action: 'reseed', key: 'T', label: 'reseed · duel setup', flow: 'studio-duel' },
    { action: 'rename', key: 'Y', label: 'rename · duel setup', flow: 'studio-duel' },
  ],
};

/** A control identifies its action, never its letter. Gatehouse can use this same lookup. */
export function keyFor(room: ModuleId, action: string, deck = roomDeck): string | undefined {
  return deck[room].find(item => item.action === action)?.key;
}

export function RoomKeyBadge({ room, action, deck = roomDeck }: { room: ModuleId; action: string; deck?: typeof roomDeck }) {
  const letter = keyFor(room, action, deck);
  return letter ? <span className="cc-control-key" aria-hidden="true"><KeyBadge letter={letter} /></span> : null;
}
