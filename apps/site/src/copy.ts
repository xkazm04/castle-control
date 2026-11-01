import type { ChamberId, SiteRoom } from './route.ts';

export const repository = 'https://github.com/xkazm04/castle-control';
export const releases = `${repository}/releases`;
export type Chamber = Readonly<{
  id: ChamberId; n: number; name: string; fn: string; ink: 'gules' | 'azure' | 'or' | 'key';
  line: string; notes: readonly (readonly [string, string])[]; inside: string;
}>;

// Words extracted from the winning landing; no prototype rendering or handlers.
export const CHAMBERS = [
  { id: 'lots', n: 1, name: 'Lot Chamber', fn: 'Lottery manager', ink: 'gules',
    line: 'Seal the roll. Wait for a public round. Cast the lots.',
    notes: [
      ['Seal', 'Freeze the entry list and publish its hash.'],
      ['Beacon', 'Announce a future public drand round, then verify its signature.'],
      ['Cast', 'Code derives the winners. The animation shows a result already decided.'],
      ['Writ', 'Download a proof bundle that anyone can recompute.'],
    ],
    inside: 'A free entry path gets equal odds. Paid entry and paid weight are blocked by default for prize draws. Offline draws are labelled streamer-controlled. Prize rules and a Twitch disclaimer belong beside the draw.' },
  { id: 'gate', n: 2, name: 'Gatehouse', fn: 'AI moderator', ink: 'azure',
    line: 'One gate guards the room and reads it.',
    notes: [
      ['Watching first', 'Shadow mode reports what a rule would do. It takes no action.'],
      ['Human review', 'Bans need a human click by default. Every action records its reason.'],
      ['The Herald’s chart', 'Opinion directions describe chat. The chart cannot act on a person.'],
      ['The drill', 'Replay recorded chat through proposed rules before using them live.'],
    ],
    inside: 'Chat delay, held-message review and Shield Mode work beside deterministic rules. Room modes run on timed leases. Crisis disclosures reach a human. Replays stay labelled simulated and never write to the live decision ledger.' },
  { id: 'beacons', n: 3, name: 'Beacons', fn: 'Contribution visuals', ink: 'or',
    line: 'Money changes how it looks, never what it decides.',
    notes: [
      ['Kindling curve', 'Map contributions to intensity ranges with a decay rule.'],
      ['Your own canvas', 'Camera frames, screen borders and objects share one renderer.'],
      ['Test fire', 'Preview a simulated 50-sub gift bomb before going live.'],
      ['On stream', 'Deliver the visual to OBS as a local browser source.'],
    ],
    inside: 'Bits, subs, gifts, Hype Train, channel points, charity and goals feed intensity. Image, shape, text and particle layers bind to the blaze. Money never changes a draw, a vote, a rank or a moderation decision.' },
  { id: 'map', n: 4, name: 'Map Room', fn: 'Extension studio', ink: 'key',
    line: 'A studio for interactive designs, expressed as data.',
    notes: [
      ['Templates', 'A hex map, a choice board, a viewer card, a draw and a contribution meter.'],
      ['Who drives', 'A human, an AI operator, or an AI that proposes for human approval.'],
      ['Test ladder', 'Local test, then Hosted Test for allowlisted accounts.'],
      ['Twitch review', 'Public Extension availability depends on Twitch policy approval and review.'],
    ],
    inside: 'The planned shell bundles its code and reads design data. It loads no remote scripts and evaluates no generated code. Viewer content needs a Twitch ID, streamer approval and attribution. Bits never buy random outcomes. This page does not claim an approved Extension.' },
] as const satisfies readonly Chamber[];

export const principles = [
  ['Drill before you go live', 'Preview and simulate before acting on a live audience. Simulated results stay visibly labelled.'],
  ['One verdict before everything', 'A barred message never counts toward a draw, a vote, a chant or a consensus.'],
  ['Lots you can check', 'Seal the roll, announce a public round, derive the winners and publish the proof. Animation never chooses a winner.'],
  ['Watching first', 'Shadow mode is the default. Bans need human approval by default. Safety lives in a deterministic action gate.'],
  ['A Steward, if you want one', 'The AI co-pilot proposes a configuration change. Nothing changes until you seal it. Local processing is the default; cloud use is opt-in.'],
  ['Built in the open', 'In development. Check the repository and release notes for shipped features. Public Extension availability awaits Twitch approval and review.'],
] as const;

export const words = {
  eyebrow: 'The live-audience toolkit · free, open source, for Twitch streamers',
  name: 'Castle Control',
  sub: 'Your channel is your keep. Point at a lit room.',
  steward_eyebrow: 'The Steward’s study · click to read',
  steward_name: 'Before the gates',
  steward_sub: 'Six promises the keep makes before it touches a live audience.',
  steward_title: 'Before you open the gates.',
  steward_lead: 'A free, open-source desktop toolkit for Twitch streamers. Bring your banners, your rules and your art.',
  fine: 'Design overview. Check releases for current availability. Illustration and figures are simulated.',
  vlabel: 'Stylised illustration · drawn, not captured · sample scene',
  footer: 'Fictional channel · invented numbers · free, open source, in development',
  footer_aside: 'Stylised illustration · drawn, not captured',
  footer_cta: 'Get the app: the same keep, with live state →',
  sample: 'Sample data',
} as const;

// The study owns availability and project notices; WP5b adds its full principles sheet.
export const stewardCopy = {
  title: principles[5][0],
  notices: [
    { text: 'Castle Control is a working name.' },
    { text: 'Not affiliated with or endorsed by Twitch.' },
    { text: 'In development; check releases for signing status.', href: releases },
    { text: 'Public Extension availability awaits Twitch approval and review.' },
  ],
  links: [
    { text: 'Docs', href: `${repository}/tree/main/docs` },
    { text: 'Source', href: repository },
  ],
} as const;

export function chamber(room: SiteRoom | null): Chamber | undefined {
  return CHAMBERS.find((item) => item.id === room);
}

export function headline(room: SiteRoom | null): { eyebrow: string; name: string; sub: string; ink: Chamber['ink'] } {
  const item = chamber(room);
  if (item) return {
    eyebrow: `Chamber ${item.n} of 4 · ${item.fn} · press ${item.n} or click to walk in`,
    name: item.name, sub: item.line, ink: item.ink,
  };
  if (room === 'steward') return {
    eyebrow: words.steward_eyebrow, name: words.steward_name, sub: words.steward_sub, ink: 'or',
  };
  return { eyebrow: words.eyebrow, name: words.name, sub: words.sub, ink: 'key' };
}
