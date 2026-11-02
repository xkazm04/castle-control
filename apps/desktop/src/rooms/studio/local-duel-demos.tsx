import { SAMPLE } from '@castle-control/duel';
import { simulateChatPages } from '@castle-control/duel/ballots';
import { Tiltyard, tiltyardWords } from '@castle-control/ui/duel';

const demoWords = { ...tiltyardWords, modes: {
  ...tiltyardWords.modes,
  show: { ...tiltyardWords.modes.show, detail: 'Local demo · you pick · not sent anywhere' },
  ladder: { ...tiltyardWords.modes.ladder, detail: 'Local demo · not sent anywhere' },
} };

/** Showdown and Ladder load only when requested from More, retaining the original local engines. */
export default function LocalDuelDemos({ mode }: { mode: 'show' | 'ladder' }) {
  return <Tiltyard key={mode} lists={SAMPLE} ballots={simulateChatPages} words={demoWords} initial_mode={mode}
    modes={['show', 'ladder']} label="Local duel demos · Showdown and Ladder" />;
}
