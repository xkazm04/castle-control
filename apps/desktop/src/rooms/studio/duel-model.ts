import type { TiltyardSession } from '@castle-control/contract';

/**
 * One picture of the duel, whoever runs it: the fixture's TS engine, the core
 * tournament, or a Steward draft. The stage draws only this; it never steps a
 * session, counts a ballot or picks a winner.
 */
export type DuelEntrant = { id: string; title: string; by?: string; note?: string; seed: number };
export type DuelSlot = { a: string | null; b: string | null; winner: string | null };
export type DuelPhase = 'ready' | 'live' | 'verdict' | 'called_off' | 'done' | 'empty';
export type DuelHow = 'call' | 'tally' | 'tie';
export type DuelPicture = {
  source: 'fixture' | 'core' | 'draft';
  /** Ballots or contestants are simulated or sample: the stage says so. */
  simulated: boolean;
  demo: boolean;
  phase: DuelPhase;
  title: string;
  prompt?: string;
  key?: string;
  match_key?: string;
  /** 0-based round of the shown match and its index inside the round. */
  round: number;
  index: number;
  /** 1-based number of the shown match and the bracket's total. */
  match: number;
  matches: number;
  left?: DuelEntrant;
  right?: DuelEntrant;
  counts: readonly [number, number];
  /** Fixture only: ballots barred by moderation and never counted. */
  barred?: number;
  window_ms: number;
  elapsed_ms: number;
  speed: 1 | 3;
  verdict?: { side: 0 | 1; how: DuelHow };
  champion?: DuelEntrant;
  /** Every round, planned rounds included (later slots stay null until decided). */
  rounds: readonly (readonly DuelSlot[])[];
  entrants: Readonly<Record<string, DuelEntrant>>;
  can_undo: boolean;
};

const PAIRS: Readonly<Record<number, readonly (readonly [number, number])[]>> = {
  8: [[0, 7], [3, 4], [1, 6], [2, 5]], 4: [[0, 3], [1, 2]], 2: [[0, 1]],
};

/** The duel's bracket sizes: 2, 4 or 8 contestants (the core's three rounds). */
export const duelSizes = [2, 4, 8] as const;

export function roundName(size: number, round: number): string {
  const left = Math.log2(Math.max(2, size)) - round;
  return left === 1 ? 'Final' : left === 2 ? 'Semifinal' : left === 3 ? 'Quarterfinal' : `Round ${round + 1}`;
}

/** Fill later rounds from earlier winners so the bracket always shows its whole shape. */
export function plannedSlots(size: number, rounds: readonly (readonly { a: string; b: string; winner?: string | null }[])[]): DuelSlot[][] {
  const out: DuelSlot[][] = [];
  const total = Math.log2(Math.max(2, size));
  for (let r = 0; r < total; r++) {
    const existing = rounds[r];
    if (existing) { out.push(existing.map(match => ({ a: match.a, b: match.b, winner: match.winner ?? null }))); continue; }
    const previous = out[r - 1] ?? [];
    const next: DuelSlot[] = [];
    for (let i = 0; i < previous.length; i += 2) next.push({ a: previous[i]?.winner ?? null, b: previous[i + 1]?.winner ?? null, winner: null });
    out.push(next);
  }
  return out;
}

/** First-round pairs for seeds in order (1 v 8, 4 v 5, 2 v 7, 3 v 6). */
export function firstRound(ids: readonly string[]): DuelSlot[] {
  return (PAIRS[ids.length] ?? []).map(([a, b]) => ({ a: ids[a] ?? null, b: ids[b] ?? null, winner: null }));
}

export const sideOf = (side: 'left' | 'right'): 0 | 1 => side === 'left' ? 0 : 1;

/** The core's snapshot, read as a picture. Labels and seconds are derived; nothing is decided here. */
export function corePicture(session: TiltyardSession | undefined, demo_key: string): DuelPicture {
  if (!session) return { source: 'core', simulated: false, demo: false, phase: 'empty', title: 'No duel started', round: 0, index: 0,
    match: 0, matches: 0, counts: [0, 0], window_ms: 15000, elapsed_ms: 0, speed: 1, rounds: [], entrants: {}, can_undo: false };
  const { bracket, list, verdict } = session;
  const entrants: Record<string, DuelEntrant> = {};
  for (const item of list.items) entrants[item.id] = { id: item.id, title: item.title, by: item.by,
    ...(item.note ? { note: item.note } : {}), seed: Number(item.seed) };
  const size = bracket.seeds.length;
  const open_round = bracket.rounds.findIndex(matches => matches.some(match => match.winner === undefined));
  const open_index = bracket.rounds[open_round]?.findIndex(match => match.winner === undefined) ?? -1;
  const round = verdict ? Number(verdict.round) : open_round < 0 ? bracket.rounds.length - 1 : open_round;
  const index = verdict ? verdict.index : open_index < 0 ? 0 : open_index;
  const pair = verdict ?? bracket.rounds[round]?.[index];
  const decided = session.history.length;
  return {
    source: 'core', simulated: session.simulated, demo: session.key === demo_key,
    phase: session.phase, title: list.title, ...(list.prompt ? { prompt: list.prompt } : {}), key: session.key,
    ...(verdict?.match_key ?? session.match_key ? { match_key: verdict?.match_key ?? session.match_key } : {}),
    round, index, match: verdict || open_round < 0 ? decided : decided + 1, matches: Math.max(1, size - 1),
    ...(pair && entrants[pair.a] ? { left: entrants[pair.a] } : {}),
    ...(pair && entrants[pair.b] ? { right: entrants[pair.b] } : {}),
    counts: verdict ? [verdict.counted.left, verdict.counted.right] : [session.counted.left, session.counted.right],
    window_ms: session.window_ms, elapsed_ms: verdict ? verdict.elapsed_ms : session.elapsed_ms,
    speed: session.speed === 3 ? 3 : 1,
    ...(verdict ? { verdict: { side: sideOf(verdict.verdict.side), how: verdict.verdict.how } } : {}),
    ...(session.champion && entrants[session.champion] ? { champion: entrants[session.champion] } : {}),
    rounds: plannedSlots(size, bracket.rounds), entrants, can_undo: decided > 0,
  };
}

export function phaseWord(picture: DuelPicture): string {
  switch (picture.phase) {
    case 'ready': return picture.source === 'draft' ? 'Draft · not started' : 'Ready · vote not open';
    case 'live': return 'Vote open';
    case 'verdict': return 'Vote closed';
    case 'called_off': return 'Called off · paused';
    case 'done': return 'Champion crowned';
    case 'empty': return 'No duel yet';
  }
}

export function verdictLine(picture: DuelPicture): string | null {
  const { verdict } = picture;
  if (!verdict) return null;
  const winner = verdict.side === 0 ? picture.left : picture.right;
  const prefix = verdict.how === 'call' ? 'Your call' : verdict.how === 'tie' ? 'Tie · higher seed wins' : 'Chat chose';
  return `${prefix}: ${winner?.title ?? 'unknown'}`;
}

export function secondsLeft(picture: DuelPicture): number {
  if (picture.phase === 'verdict' || picture.phase === 'done') return 0;
  return Math.max(0, Math.ceil((picture.window_ms - picture.elapsed_ms) / 1000));
}

/** One spoken line for "Catch me up" and the live region. */
export function pictureLine(picture: DuelPicture): string {
  if (picture.phase === 'empty') return 'No duel is running.';
  if (picture.phase === 'done') return `${picture.champion?.title ?? 'A champion'} is champion of ${picture.title}.`;
  const head = `${roundName(picture.rounds[0]?.length ? picture.rounds[0].length * 2 : 2, picture.round)}, match ${picture.match} of ${picture.matches}`;
  const pair = picture.left && picture.right ? `${picture.left.title} ${picture.counts[0]}, ${picture.right.title} ${picture.counts[1]}` : '';
  return `${head}: ${phaseWord(picture).toLowerCase()}${picture.phase === 'live' ? `, ${secondsLeft(picture)} s left` : ''}. ${pair}.`;
}

/** What the "Start a duel" and demo flows build. Nothing runs until the seal. */
export type DuelEntry = { title: string; by?: string; note?: string };
export type DuelDraft = {
  preset?: string;
  title: string;
  prompt?: string;
  entries: readonly DuelEntry[];
  window_s: number;
  /** The roster step chose to rewrite the entries. */
  edit?: boolean;
  demo?: boolean;
  /** Seed order for the core and the TS engine; ids are slugs unique within the list. */
};

/** Contestant ids: lowercase slugs, unique, never empty (the core's TiltyardId pattern). */
export function entryIds(entries: readonly DuelEntry[]): string[] {
  const seen = new Set<string>();
  return entries.map((entry, index) => {
    const base = entry.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 56).replace(/-+$/g, '')
      || `entry-${index + 1}`;
    let id = base;
    for (let n = 2; seen.has(id); n++) id = `${base}-${n}`;
    seen.add(id);
    return id;
  });
}

/** Split "A; B; C; D" into entries: 2, 4 or 8 names, each 1 to 80 characters, no repeats. */
export function parseEntries(raw: string): { entries: string[] } | { error: string } {
  const entries = raw.split(';').map(part => part.trim().replace(/\s+/g, ' ')).filter(Boolean);
  if (!(duelSizes as readonly number[]).includes(entries.length)) return { error: `Name 2, 4 or 8 contestants separated by ";" (you named ${entries.length}).` };
  if (entries.some(entry => entry.length > 80)) return { error: 'Keep each name to 80 characters.' };
  if (new Set(entries.map(entry => entry.toLowerCase())).size !== entries.length) return { error: 'Each contestant needs a different name.' };
  return { entries };
}

export function draftPicture(draft: DuelDraft): DuelPicture {
  const ids = entryIds(draft.entries);
  const entrants: Record<string, DuelEntrant> = {};
  draft.entries.forEach((entry, index) => {
    const id = ids[index]!;
    entrants[id] = { id, title: entry.title, ...(entry.by ? { by: entry.by } : {}), ...(entry.note ? { note: entry.note } : {}), seed: index + 1 };
  });
  const first = firstRound(ids)[0];
  return {
    source: 'draft', simulated: draft.demo === true || draft.preset !== 'custom', demo: draft.demo === true, phase: 'ready', title: draft.title,
    ...(draft.prompt ? { prompt: draft.prompt } : {}), round: 0, index: 0, match: 1, matches: Math.max(1, ids.length - 1),
    ...(first?.a && entrants[first.a] ? { left: entrants[first.a] } : {}),
    ...(first?.b && entrants[first.b] ? { right: entrants[first.b] } : {}),
    counts: [0, 0], window_ms: draft.window_s * 1000, elapsed_ms: 0, speed: draft.demo ? 3 : 1,
    rounds: plannedSlots(ids.length, [firstRound(ids).map(slot => ({ a: slot.a ?? '', b: slot.b ?? '' }))]), entrants, can_undo: false,
  };
}
