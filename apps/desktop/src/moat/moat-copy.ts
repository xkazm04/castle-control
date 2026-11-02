import type { MoatMarker } from './moat-model.js';

// Plain words for the moat. Verdict and stamp wording match the Overview scene ("HELD · NOT ON AIR").
export const actionWords = { warn: 'Warn', delete: 'Delete message', timeout: 'Time out', hold: 'Hold for review', ban: 'Ban' } as const;
export const fateWords = { aired: 'Aired', held: 'Held · not on air', unresolved: 'Not evaluated' } as const;

/** Counts read with thousands separators, so a busy night says 2,000 and not 2000. */
const n = (value: number) => value.toLocaleString('en-US');

export const moatCopy = {
  title: 'The moat · simulated replay',
  region: 'Moat timeline, simulated replay',
  stamp: 'HELD · NOT ON AIR',
  rule_line: (rule_id?: string) => rule_id ? `rule · ${rule_id}` : 'no rule id',
  chat: 'CHAT · replay · message text is never shown',
  stream: 'STREAM · what viewers would have seen',
  gate: 'THE GATE',
  gate_delay: (delay_s: number) => `THE GATE · chat delay ${delay_s} s`,
  gap: 'RECORDING GAP', gap_note: 'missing, not replayed',
  play: 'Play', replay: 'Replay', pause: 'Pause', speed: 'Speed', speed_label: (speed: number) => `${speed}×`,
  position: 'Replay position', stops: 'Stopped messages', previous_stop: 'Previous stop', next_stop: 'Next stop',
  position_text: (clock: string, replayed: number, total: number) => `replay ${clock} · ${n(replayed)} of ${n(total)}`,
  held_of: (held: number, total: number) => `Held ${n(held)} of ${n(total)}`,
  simulated: 'simulated',
  summary: (held: number, total: number) => `Held ${n(held)} of ${n(total)} · simulated`,
  breakdown: (counts: { aired: number; held: number; unresolved: number; undated: number }) =>
    [`${n(counts.aired)} aired`, `${n(counts.held)} held`, ...counts.unresolved ? [`${n(counts.unresolved)} not evaluated`] : [],
      ...counts.undated ? [`${n(counts.undated)} without a usable time, not drawn`] : []].join(' · '),
  empty: 'No outcome has a usable time, so there is nothing to draw. The table below lists every outcome.',
  reduced: 'Reduced motion is on: the replay is shown finished, with every stamp in place. Use the position control to step through it.',
  honesty: 'Drawn from outcome time, state, verdict, action and rule id only. Nothing here is live and nothing was sent to Twitch.',
  legend: { aired: 'aired', stopped: 'stopped at the gate', unresolved: 'not evaluated', waiting: 'not replayed yet', gap: 'recording missing' },
  thinned: (count: number) => `${n(count)} aired dots are merged in this view. Every stopped message is still drawn.`,
  overflow: (count: number, spotlit: boolean) => `${n(count)} more stopped here than fit as stamps. ${spotlit ? 'Find them in the table.' : 'Spotlight a rule to see its stamps alone, or find them in the table.'}`,
  page: 'Showing part of the night; the view turns with the playhead.',
  inspector: 'Selected message', inspect_empty: 'Select a stamp, a dot or a table row to see its state, action and rule.',
  inspect_none: 'Nothing selected',
  rule_mode: { shadow: 'watching, reports only', armed: 'armed, acts' },
  open_rule: (rule_id: string) => `Open rule ${rule_id} in the rule bench`,
  open_rule_note: 'The bench previews pattern hits only. It never arms a rule.',
  no_text: 'No message text is stored or shown. Nothing was sent to Twitch.',
  state: 'State', action: 'Action', rule: 'Rule', verdict: 'Verdict', source: 'Source', at: 'At', evaluation: 'Judge', outcome: 'Outcome',
  none: 'none recorded',
  evaluation_words: { true: 'passed its case', false: 'failed its case', none: 'no valid answer' },
  stamp_name: (marker: MoatMarker) => `Held, not on air: ${marker.message_id}${marker.rule_id ? `, rule ${marker.rule_id}` : ''}. Inspect.`,
  dot_name: (marker: MoatMarker) => `${marker.message_id}: ${fateWords[marker.fate]}`,
  busy: {
    toggle: 'Replay a busy night · 2,000 simulated messages',
    note: (count: number) => `${count.toLocaleString('en-US')} simulated messages over about an hour, with a long recording gap. The strip shows part of the night at a time and turns with the playhead.`,
  },
  spotlight: {
    label: 'Spotlight a rule', chip: (rule_id: string, held: number) => `${rule_id} · ${held}`,
    note: (rule_id: string) => `Stamps for rule ${rule_id} only. Other stops are dimmed, and Previous and Next stop walk this rule.`,
  },
  heartbeat: 'Sample replay loop · simulated', heartbeat_label: 'Sample replay · simulated',
  quiet: 'No replay yet · run a drill in the Gatehouse', quiet_name: 'The moat, empty: no replay has run yet',
  loop_pause: 'Pause the sample loop', loop_play: 'Play the sample loop',
  print: 'Print night report',
  compare: {
    title: 'Moat comparison · simulated', toggle: 'Compare with a simulated candidate', region: 'Baseline and candidate moats, simulated replay',
    note_fixture: 'Candidate rules are simulated: the links rule is disarmed and the repeats rule is tightened. Same recording, same times. Dashed rings mark messages whose outcome changes.',
    note_core: 'Baseline and candidate replay the same recording. Dashed rings mark messages whose outcome changes.',
    baseline: 'BASELINE', candidate: 'CANDIDATE',
    caption: (name: string, held: number, total: number) => `${name} · held ${n(held)} of ${n(total)}`,
    summary: (baseline: number, candidate: number, total: number) => `Baseline held ${n(baseline)} of ${n(total)} · candidate held ${n(candidate)} of ${n(total)} · simulated`,
    breakdown: (changed: number, newly_held: number, released: number) => `${n(changed)} changed · ${n(newly_held)} newly held · ${n(released)} released`,
    unaligned: 'These two runs cannot be drawn on one playhead: they do not share one timeline, or one has no usable times. The tables below list each run.',
    inspect_empty: 'Select a stamp or a ringed dot to see what the candidate changes.',
    field: 'Field', changed_word: 'Changed by the candidate', same_word: 'Same outcome in both runs', absent: 'not in this run',
    legend_changed: 'outcome changed by the candidate',
  },
  report: {
    title: 'Gatehouse night report', kicker: 'Simulated replay · no live ledger was invoked · nothing was sent to Twitch',
    source: 'Source', from: 'From', to: 'To', hash: 'Instrument hash', hash_fixture: 'illustrative fixture value', hash_core: 'reported by core',
    gaps: 'Recording gaps', no_gaps: 'No recording gaps.', gap_line: (from: string, to: string) => `${from} to ${to}: missing, not replayed`,
    overflow: (count: number) => `${n(count)} more stopped here than fit as stamps on the strip. Every stop is in the table below, up to its row limit.`,
    stopped: 'Stopped at the gate', none_stopped: 'Nothing was stopped at the gate.',
    more: (count: number) => `${count.toLocaleString('en-US')} more stopped messages are listed in the drill table.`,
    time: 'Time', message: 'Message', verdict: 'Verdict', rule: 'Rule', action: 'Action', evaluation: 'Judge',
    note: 'Drawn from outcome time, state, verdict, action and rule id only. The contract carries no message text, so none is printed.',
  },
  table_inspect: (id: string) => `Inspect ${id}`,
} as const;
