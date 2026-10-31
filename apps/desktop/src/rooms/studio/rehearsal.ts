import { boardGeometry } from './board.js';
import type { StudioBoard, StudioTile } from './board.js';
import { rehearseCopy as copy } from './rehearse-copy.js';

/** Local mirror, by value, of the renderer's closed `join_side` and `pick_tile` viewer
 * actions. It adds no identifier, identity, tally or transport field of its own. */
export type RehearsalAction =
  | Readonly<{ kind: 'join_side'; side: string }>
  | Readonly<{ kind: 'pick_tile'; q: number; r: number }>;

export const rehearsalLimits = Object.freeze({
  viewers: Object.freeze({ min: 10, max: 1000 }),
  turns: Object.freeze({ min: 2, max: 24 }),
  seed_length: 24,
});
export type RehearsalSetup = Readonly<{ seed: string; viewers: number; turns: number }>;
export const rehearsalDefaults: RehearsalSetup = Object.freeze({ seed: '2041', viewers: 120, turns: 8 });
export type RehearsalField = 'seed' | 'viewers' | 'turns';
export type RehearsalError = Readonly<{ code: 'invalid_rehearsal'; field: RehearsalField; message: string }>;
export type RehearsalSetupResult = Readonly<{ ok: true; setup: RehearsalSetup } | { ok: false; error: RehearsalError }>;

function refuse(field: RehearsalField, message: string): { ok: false; error: RehearsalError } {
  return { ok: false, error: Object.freeze({ code: 'invalid_rehearsal', field, message }) };
}
function whole(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : undefined;
  return typeof value === 'string' && /^\d{1,6}$/.test(value.trim()) ? Number(value) : undefined;
}

/** The single door for form input: closed fields, whole numbers inside the limits, a short
 * non-blank seed. Nothing else reaches the simulation, so it never sees a partly parsed setup. */
export function parseRehearsalSetup(value: unknown): RehearsalSetupResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Reflect.ownKeys(value).some(key => typeof key !== 'string' || !['seed', 'viewers', 'turns'].includes(key))) {
    return refuse('seed', copy.setup_shape);
  }
  const fields = value as Record<string, unknown>;
  const seed = typeof fields.seed === 'string' ? fields.seed.trim() : '';
  if (!seed || seed.length > rehearsalLimits.seed_length) return refuse('seed', copy.seed_error(rehearsalLimits.seed_length));
  const { viewers: v, turns: t } = rehearsalLimits;
  const viewers = whole(fields.viewers);
  if (viewers === undefined || viewers < v.min || viewers > v.max) return refuse('viewers', copy.viewers_error(v.min, v.max));
  const turns = whole(fields.turns);
  if (turns === undefined || turns < t.min || turns > t.max) return refuse('turns', copy.turns_error(t.min, t.max));
  return { ok: true, setup: Object.freeze({ seed, viewers, turns }) };
}

export type TilePicks = Readonly<{ id: string; q: number; r: number; by: Readonly<Record<string, number>> }>;
export type TileChange = Readonly<{ id: string; from?: string; to: string }>;
export type RehearsalTurn = Readonly<{
  turn: number; actions: readonly RehearsalAction[]; picks: readonly TilePicks[]; changes: readonly TileChange[];
  took: Readonly<Record<string, number>>; held: Readonly<Record<string, number>>; unclaimed: number;
  board: StudioBoard; signature: string;
}>;
export type Rehearsal = Readonly<{
  setup: RehearsalSetup; start: StudioBoard; turns: readonly RehearsalTurn[];
}>;
export type RehearsalRun = Readonly<{ ok: true; rehearsal: Rehearsal } | { ok: false; error: RehearsalError }>;

/** Model constants. The three dials that make rounds differ: bandwagon (viewers drift to the house
 * holding more), fortification (interior tiles resist one pick per three friendly neighbours) and
 * attack share (the rest of each house defends its own border). */
const model = Object.freeze({ floor: 0.5, bandwagon: 0.6, attack: 0.55, enemy: 0.8, fortify: 2, garrison: 2, jitter: 0.3, pull: 0.5 });
const DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]] as const;

function fnv(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193);
  return hash >>> 0;
}
/** Seeded generator (mulberry32 over an FNV-1a hash of the seed text). Nothing here reads a clock. */
function generator(seed: string): () => number {
  let state = fnv(`rehearsal:${seed}`);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}
function weighted(weights: readonly number[], roll: number): number {
  let edge = roll * weights.reduce((sum, weight) => sum + weight, 0);
  for (const [index, weight] of weights.entries()) { edge -= weight; if (edge < 0) return index; }
  return weights.length - 1;
}

/** A fresh seed that follows from the last one, so Rehearse again is repeatable and reads no clock. */
export function nextSeed(seed: string): string { return String(1000 + fnv(`next:${seed}`) % 9000); }

type Targets = { tiles: number[]; weights: number[] };
function frontier(side: number, owner: readonly number[], near: readonly (readonly number[])[], held: readonly number[]): Targets {
  const found: Targets = { tiles: [], weights: [] };
  owner.forEach((holder, index) => {
    if (holder === side) return;
    const friends = near[index]?.filter(other => owner[other] === side).length ?? 0;
    // A house with no land has no front: its viewers muster on any unclaimed tile.
    if (friends === 0 && !(held[side] === 0 && holder < 0)) return;
    found.tiles.push(index); found.weights.push((1 + friends) * (holder < 0 ? 1 : model.enemy));
  });
  return found;
}
function border(side: number, owner: readonly number[], near: readonly (readonly number[])[]): Targets {
  const found: Targets = { tiles: [], weights: [] };
  owner.forEach((holder, index) => {
    const foes = holder === side ? near[index]?.filter(other => owner[other] !== side).length ?? 0 : 0;
    if (foes > 0) { found.tiles.push(index); found.weights.push(1 + foes); }
  });
  return found;
}

function snapshot(board: StudioBoard, owner: readonly number[]): StudioBoard {
  const tiles = board.tiles.map((tile, index): StudioTile => {
    const side = board.sides[owner[index] ?? -1]?.id;
    if (side === tile.side) return tile;
    return Object.freeze(side === undefined ? { q: tile.q, r: tile.r } : { q: tile.q, r: tile.r, side });
  });
  return Object.freeze({ title: board.title, sides: board.sides, tiles: Object.freeze(tiles) });
}

const tally = (counts: readonly number[], board: StudioBoard): Readonly<Record<string, number>> =>
  Object.freeze(Object.fromEntries(board.sides.map((side, index) => [side.id, counts[index] ?? 0])));

/** Plays a validated, frozen board. Every simulated viewer emits `join_side` then `pick_tile`; a tile
 * can only change owner if it was picked this turn. Same board, seed and viewer count: same round. */
export function runRehearsal(board: StudioBoard, setup: RehearsalSetup): RehearsalRun {
  if (board.sides.length < 2) return refuse('seed', copy.needs_two_houses);
  const geometry = boardGeometry(board);
  const where = new Map(board.tiles.map((tile, index) => [`${tile.q},${tile.r}`, index]));
  const near = board.tiles.map(tile => DIRECTIONS.flatMap(([dq, dr]) => where.get(`${tile.q + dq},${tile.r + dr}`) ?? []));
  const sides = board.sides.map(side => side.id);
  const random = generator(setup.seed);
  const pull = sides.map(() => 0.7 + random() * model.pull);
  let owner = board.tiles.map(tile => (tile.side === undefined ? -1 : sides.indexOf(tile.side)));
  const turns: RehearsalTurn[] = [];
  for (let turn = 1; turn <= setup.turns; turn += 1) {
    const held = sides.map((_, side) => owner.filter(holder => holder === side).length);
    const joins = sides.map((_, side) => (pull[side] ?? 1) * (0.85 + model.jitter * random())
      * (model.floor + (held[side] ?? 0) / board.tiles.length) ** model.bandwagon);
    const attack = sides.map((_, side) => frontier(side, owner, near, held));
    const defend = sides.map((_, side) => border(side, owner, near));
    const actions: RehearsalAction[] = []; const counts = new Map<number, number[]>();
    for (let viewer = 0; viewer < setup.viewers; viewer += 1) {
      const side = weighted(joins, random());
      actions.push({ kind: 'join_side', side: sides[side] ?? '' });
      const front = attack[side]; const wall = defend[side];
      const list = front?.tiles.length && (!wall?.tiles.length || random() < model.attack) ? front : wall;
      if (!list?.tiles.length) continue;
      const index = list.tiles[weighted(list.weights, random())] ?? 0;
      const tile = board.tiles[index];
      if (!tile) continue;
      actions.push({ kind: 'pick_tile', q: tile.q, r: tile.r });
      const row = counts.get(index) ?? sides.map(() => 0);
      row[side] = (row[side] ?? 0) + 1; counts.set(index, row);
    }
    const next = [...owner]; const changes: TileChange[] = []; const took = sides.map(() => 0);
    for (const index of [...counts.keys()].sort((a, b) => a - b)) {
      const row = [...(counts.get(index) ?? [])]; const holder = owner[index] ?? -1;
      if (holder >= 0) {
        const friends = near[index]?.filter(other => owner[other] === holder).length ?? 0;
        row[holder] = (row[holder] ?? 0) + model.garrison + Math.floor(friends / model.fortify);
      }
      const best = Math.max(...row);
      const leaders = row.flatMap((value, side) => (value === best ? side : []));
      const winner = leaders.length === 1 ? leaders[0] ?? -1 : leaders[Math.floor(random() * leaders.length)] ?? -1;
      if (winner < 0 || winner === holder) continue;
      next[index] = winner; took[winner] = (took[winner] ?? 0) + 1;
      changes.push(Object.freeze({ id: geometry.tiles[index]?.id ?? '', to: sides[winner] ?? '',
        ...(holder >= 0 ? { from: sides[holder] ?? '' } : {}) }));
    }
    owner = next;
    const picks = [...counts.entries()].sort(([a], [b]) => a - b).map(([index, row]) => Object.freeze({
      id: geometry.tiles[index]?.id ?? '', q: board.tiles[index]?.q ?? 0, r: board.tiles[index]?.r ?? 0,
      by: tally(row, board) }));
    const now = sides.map((_, side) => owner.filter(holder => holder === side).length);
    turns.push(Object.freeze({ turn, actions: Object.freeze(actions), picks: Object.freeze(picks),
      changes: Object.freeze(changes), took: tally(took, board), held: tally(now, board),
      unclaimed: owner.filter(holder => holder < 0).length, board: snapshot(board, owner),
      signature: fnv(owner.join(',')).toString(16).padStart(8, '0') }));
  }
  return { ok: true, rehearsal: Object.freeze({ setup, start: board, turns: Object.freeze(turns) }) };
}

/** How many turns of `again` match `first` exactly, by ownership signature. */
export function matchedTurns(first: Rehearsal, again: Rehearsal): number {
  return first.turns.filter((turn, index) => again.turns[index]?.signature === turn.signature).length;
}
