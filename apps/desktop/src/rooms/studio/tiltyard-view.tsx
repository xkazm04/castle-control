import { SAMPLE } from '@castle-control/duel';
import { simulateChatPages } from '@castle-control/duel/ballots';
import { Tiltyard, tiltyardWords } from '@castle-control/ui/duel';

/** Fixture-only Map Room stage; lists and ballot pages use the engine's doors. */
export default function TiltyardView() {
  return <Tiltyard lists={SAMPLE} ballots={simulateChatPages} words={tiltyardWords} label="The Tiltyard, duel stage" />;
}
