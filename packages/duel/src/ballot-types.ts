import type { GatehouseProvenance, GatehouseReadCursor, RecordedMessage, Verdict } from '@castle-control/contract';
import type { TimeIndex } from './tally-time.js';

export type BallotOption = 0 | 1;
export type Vote = Readonly<{ kind: 'vote'; option_index: number }>;
export type Ballot = RecordedMessage & { verdict: Verdict; provenance: GatehouseProvenance };
export type BallotPage = { items: Ballot[]; next_cursor?: GatehouseReadCursor };

type EventDetails = { t_ms: number; user_id: string; text: string; cheer: boolean; provenance: GatehouseProvenance };
export type WindowEvent = EventDetails & (
  | { status: 'counted'; option: BallotOption; vote: Vote }
  | { status: 'barred' | 'held' | 'repeat' | 'chatter'; option?: BallotOption; vote?: never }
);

export type Tally = {
  counted: [number, number];
  barred: [number, number];
  held: number;
  repeat: number;
  chatter: number;
  cheers_as_one: number;
  seen: number;
  total: number;
  share: number;
  shadow: [number, number];
};

export type IndexedWindow = {
  readonly provenance: GatehouseProvenance | 'mixed';
  readonly events: readonly WindowEvent[];
  readonly prefix: readonly Tally[];
  readonly time_index: TimeIndex;
};
export type TallyMeter = { probes: number };
