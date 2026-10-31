import type { MoatMarker } from './moat-model.js';

// Plain words for the moat. Verdict and stamp wording match the Overview scene ("HELD · NOT ON AIR").
export const actionWords = { warn: 'Warn', delete: 'Delete message', timeout: 'Time out', hold: 'Hold for review', ban: 'Ban' } as const;
export const fateWords = { aired: 'Aired', held: 'Held · not on air', unresolved: 'Not evaluated' } as const;

export const moatCopy = {
  title: 'The moat · simulated replay',
  region: 'Moat timeline, simulated replay',
  stamp: 'HELD · NOT ON AIR',
  rule_line: (rule_id?: string) => rule_id ? `rule · ${rule_id}` : 'no rule id',
  chat: 'CHAT · replayed recording · message text is never shown',
  stream: 'STREAM · what viewers would have seen',
  gate: 'THE GATE',
  gate_delay: (delay_s: number) => `THE GATE · chat delay ${delay_s} s`,
  gap: 'RECORDING GAP', gap_note: 'missing, not replayed',
  play: 'Play', replay: 'Replay', pause: 'Pause', speed: 'Speed', speed_label: (speed: number) => `${speed}×`,
  position: 'Replay position',
  position_text: (clock: string, replayed: number, total: number) => `replay ${clock} · ${replayed} of ${total}`,
  held_of: (held: number, total: number) => `Held ${held} of ${total}`,
  simulated: 'simulated',
  summary: (held: number, total: number) => `Held ${held} of ${total} · simulated`,
  breakdown: (counts: { aired: number; held: number; unresolved: number; undated: number }) =>
    [`${counts.aired} aired`, `${counts.held} held`, ...counts.unresolved ? [`${counts.unresolved} not evaluated`] : [],
      ...counts.undated ? [`${counts.undated} without a usable time, not drawn`] : []].join(' · '),
  empty: 'No outcome has a usable time, so there is nothing to draw. The table below lists every outcome.',
  reduced: 'Reduced motion is on: the replay is shown finished, with every stamp in place. Use the position control to step through it.',
  honesty: 'Drawn from outcome time, state, verdict, action and rule id only. Nothing here is live and nothing was sent to Twitch.',
  legend: { aired: 'aired', stopped: 'stopped at the gate', unresolved: 'not evaluated', waiting: 'not replayed yet', gap: 'recording missing' },
  thinned: (count: number) => `${count.toLocaleString('en-US')} aired dots are merged in this view. Every stopped message is still drawn.`,
  overflow: (count: number) => `${count.toLocaleString('en-US')} more stopped here than fit as stamps. Find them in the table.`,
  page: 'Showing part of the night; the view turns with the playhead.',
  inspector: 'Selected message', inspect_empty: 'Select a stamp, a dot or a table row to see its state, action and rule.',
  inspect_none: 'Nothing selected',
  open_rule: (rule_id: string) => `Open rule ${rule_id} in the rule bench`,
  open_rule_note: 'The bench previews pattern hits only. It never arms a rule.',
  no_text: 'No message text is stored or shown. Nothing was sent to Twitch.',
  state: 'State', action: 'Action', rule: 'Rule', verdict: 'Verdict', source: 'Source', at: 'At', evaluation: 'Evaluation', outcome: 'Outcome',
  none: 'none recorded',
  evaluation_words: { true: 'passed', false: 'did not pass', none: 'no valid answer' },
  stamp_name: (marker: MoatMarker) => `Held, not on air: ${marker.message_id}${marker.rule_id ? `, rule ${marker.rule_id}` : ''}. Inspect.`,
  dot_name: (marker: MoatMarker) => `${marker.message_id}: ${fateWords[marker.fate]}`,
  heartbeat: 'Sample replay loop · simulated',
  table_inspect: (id: string) => `Inspect ${id}`,
} as const;
