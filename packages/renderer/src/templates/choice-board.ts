import { integer, list, localImage, record, text } from './validation.ts';

export interface ChoiceOption {
  readonly label: string;
  readonly votes: number;
  readonly image_path?: string;
}
export interface ChoiceBoardData { readonly options: readonly ChoiceOption[] }
export interface ChoiceBoardScene {
  readonly total_votes: number;
  readonly bars: readonly (ChoiceOption & { readonly share: number })[];
}

export function parseChoiceBoard(value: unknown): ChoiceBoardData {
  const fields = record(value, ['options'], 'choice-board');
  const options = list(fields.options, 'options').map((value) => {
    const option = record(value, ['label', 'votes', 'image_path'], 'option');
    return Object.freeze({
      label: text(option.label, 'label'), votes: integer(option.votes, 'votes', 0), ...localImage(option),
    });
  });
  if (options.length < 2 || options.length > 6) throw new Error('choice-board requires 2 to 6 options');
  integer(options.reduce((sum, option) => sum + option.votes, 0), 'total_votes', 0);
  return Object.freeze({ options: Object.freeze(options) });
}

/** Shares describe the supplied tally only; this builder never counts or accepts viewer actions. */
export function buildChoiceBoardScene(value: unknown): ChoiceBoardScene {
  const { options } = parseChoiceBoard(value);
  const total_votes = options.reduce((sum, option) => sum + option.votes, 0);
  const last_positive = options.findLastIndex((option) => option.votes > 0);
  let allocated = 0;
  const bars = Object.freeze(options.map((option, index) => {
    const remaining = 1 - allocated;
    const share = total_votes === 0 ? 0 : index === last_positive
      ? remaining : Math.min(remaining, option.votes / total_votes);
    allocated += share;
    return Object.freeze({ ...option, share });
  }));
  return Object.freeze({ total_votes, bars });
}

/** Original simulated, renderer-local data; not a contract identifier. */
export const CHOICE_BOARD_TEMPLATE: ChoiceBoardData = parseChoiceBoard({
  options: [
    { label: 'Simulated northern route', votes: 0 },
    { label: 'Simulated southern route', votes: 0 },
    { label: 'Simulated stay here', votes: 0 },
  ],
});
