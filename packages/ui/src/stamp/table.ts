export const stampKinds = ['sample', 'simulated', 'shadow', 'armed', 'on-air', 'off-air', 'sealed', 'draft', 'held', 'pass', 'blocked', 'ok'] as const;
export type StampKind = typeof stampKinds[number];

export type StampSpec = {
  word: string;
  label: string;
  ink: 'key' | 'gules' | 'azure' | 'or';
  fill: 'outline' | 'solid';
  rule: 'solid' | 'dashed';
  tilt: number;
  dot: 'none' | 'lamp' | 'ring' | 'seal';
};

/** Fixed meanings: gules acts on viewers (ARMED, ON AIR), azure watches (SHADOW),
 * key marks SAMPLE/SIMULATED, SEALED is key with an or seal. */
export const stampTable = {
  sample: { word: 'Sample', label: 'Sample data', ink: 'key', fill: 'outline', rule: 'solid', tilt: -2, dot: 'none' },
  simulated: { word: 'Simulated', label: 'Simulated', ink: 'key', fill: 'outline', rule: 'dashed', tilt: 1.5, dot: 'none' },
  shadow: { word: 'Shadow', label: 'Shadow: watching, takes no action', ink: 'azure', fill: 'outline', rule: 'solid', tilt: -1, dot: 'none' },
  armed: { word: 'Armed', label: 'Armed: can act on viewers', ink: 'gules', fill: 'solid', rule: 'solid', tilt: 2, dot: 'none' },
  'on-air': { word: 'On air', label: 'On air', ink: 'gules', fill: 'solid', rule: 'solid', tilt: -1.5, dot: 'lamp' },
  'off-air': { word: 'On air · simulated', label: 'On air is simulated: nothing is broadcast', ink: 'gules', fill: 'outline', rule: 'solid', tilt: -1.5, dot: 'ring' },
  sealed: { word: 'Sealed', label: 'Sealed by the streamer', ink: 'key', fill: 'solid', rule: 'solid', tilt: -4, dot: 'seal' },
  draft: { word: 'Draft · not on air', label: 'Draft, not on air', ink: 'or', fill: 'outline', rule: 'dashed', tilt: 1, dot: 'none' },
  held: { word: 'Held · not on air', label: 'Held for review, not on air', ink: 'gules', fill: 'outline', rule: 'solid', tilt: -2.5, dot: 'none' },
  pass: { word: 'Pass', label: 'Pass', ink: 'azure', fill: 'outline', rule: 'solid', tilt: 1, dot: 'none' },
  blocked: { word: 'Blocked', label: 'Blocked', ink: 'gules', fill: 'outline', rule: 'solid', tilt: 2.5, dot: 'none' },
  ok: { word: 'OK', label: 'Allowed', ink: 'key', fill: 'outline', rule: 'solid', tilt: -1, dot: 'none' },
} as const satisfies Record<StampKind, StampSpec>;

export function stampParts(kind: StampKind, word?: string): {
  className: string; dataset: { stamp: StampKind }; ariaLabel: string; word: string; dot: StampSpec['dot'];
} {
  if (word !== undefined && !word.trim()) throw new Error('A stamp needs its word');
  const spec = stampTable[kind];
  return {
    className: 'cc-stamp',
    dataset: { stamp: kind },
    ariaLabel: spec.label + (word !== undefined && word !== spec.word ? `: ${word}` : ''),
    word: word ?? spec.word,
    dot: spec.dot,
  };
}

export const inkEdgeFilter = {
  id: 'inkedge', x: '-5%', y: '-10%', width: '110%', height: '120%',
  turbulence: { type: 'fractalNoise', baseFrequency: '.85', numOctaves: '2', seed: '7' },
  displacement: { in: 'SourceGraphic', scale: '1.8', xChannelSelector: 'R', yChannelSelector: 'G' },
} as const;
