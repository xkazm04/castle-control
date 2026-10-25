// Castle vocabulary is display copy only; state and component identifiers stay plain.
export const moderationCopy = {
  title: 'Gatehouse', description: 'AI moderator · one verdict before anything counts',
  notice: 'SIMULATED · generated fixtures only. Preview controls change this page only; nothing is sent.',
  modes: 'Armed / Watching preview only. Actual rules stay Watching; arming is unavailable before the live spike.',
  room: 'The room', orders: 'Garrison orders · room modes', delay: 'The moat · chat delay',
  shield: 'Raise the drawbridge', shield_on: 'Bridge up · lower it',
  consensus: "The Herald’s chart", consensus_gloss: 'Consensus · describes the room, never acts on anyone',
  live: 'The live room', rules: 'Gate rules', held: 'At the portcullis',
  bans: 'Ban queue', ledger: 'The gate roll', replay: 'The drill',
  replay_gloss: 'Replay simulator · generated recording', back: '← Back to the Gatehouse',
  replay_open: 'Run the drill', clear: 'The portcullis is clear',
  pass: 'Pass', strike: 'Strike', ban: 'Ban', dismiss: 'Dismiss', undo: 'Undo', petition: 'Petition',
} as const;
