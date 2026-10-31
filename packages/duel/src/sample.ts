import { parseDuelList, slugId } from './list.js';

export const SAMPLE_LABEL = 'SAMPLE';
const provenance = 'sample' as const;
const item = (title: string, n: number, note = '') => ({
  id: slugId(title), title, by: `simulated_viewer_${String(n).padStart(4, '0')}`, note,
});

/** Exact contestant text from .port/winner/duel-engine.js (cc-t2-duel A/1). */
export const SAMPLE = {
  bracket: {
    ...parseDuelList({
      title: 'Best boss fight', prompt: 'Rank the best boss fight',
      items: [
        item('The Ashen Warden', 311, 'cathedral roof · phase two'),
        item('Clockwork Hydra', 348, 'seven heads, one key'),
        item('Mirror Knight', 385, 'copies your last move'),
        item('Salt King', 422, 'fought at low tide'),
        item('Hollow Bell', 459, 'only hits on the toll'),
        item('Twin Lanterns', 496, 'two bosses, one bar'),
        item('Moss Colossus', 533, 'climb it to win'),
        item('Glass Serpent', 570, 'shatters, reforms'),
      ],
    }),
    provenance,
  },
  chat: {
    ...parseDuelList({
      title: 'The mill question', prompt: 'What does the village do with the mill?',
      items: [
        item('Raze the mill', 101, 'type 1 for the left card'),
        item('Tax the miller', 117, 'type 1 or 2 in chat'),
        item('Spare it', 129, 'type 2 for the right card'),
        item('Borrow the mill', 143, 'type 1 or 2 in chat'),
      ],
    }),
    window_ms: 15000, key: 'mill', provenance,
  },
  ladder: {
    title: "Chat's all-time top 10 games", provenance,
    top: {
      ...parseDuelList({
        title: "Chat's all-time top 10 games",
        items: [
          item('Lantern Keeper', 201), item('Ironvale', 214), item('Saltmarsh Tales', 227),
          item('Hollowdeep', 238), item('Skyward Forge', 246), item('Ember Court', 259),
          item('Tidebound', 263), item('Starling Road', 270), item('Quiet Moor', 288),
          item('Copper Saints', 296),
        ],
      }),
      provenance,
    },
    queue: {
      ...parseDuelList({
        title: 'Suggestion queue',
        items: [
          item('Wyrmlight', 412, 'suggested in chat'),
          item('Paper Comet', 433, 'suggested in chat'),
          item('Bramble & Bone', 457, 'suggested in chat'),
        ],
      }),
      provenance,
    },
  },
} as const;
