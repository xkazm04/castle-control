import { describe, expect, it } from 'vitest';
import { buildChoiceBoardScene, parseChoiceBoard, CHOICE_BOARD_TEMPLATE } from './choice-board.ts';

describe('choice-board renderer-local data (simulated)', () => {
  it('renders labels, vote tallies and normalized bars, with all zero for no votes', () => {
    const data = { options: [
      { label: 'Simulated first', votes: 3, image_path: 'assets/first.png' },
      { label: 'Simulated second', votes: 1 },
    ] };
    const scene = buildChoiceBoardScene(data);
    expect(scene.total_votes).toBe(4);
    expect(scene.bars).toEqual([
      { label: 'Simulated first', votes: 3, image_path: 'assets/first.png', share: 0.75 },
      { label: 'Simulated second', votes: 1, share: 0.25 },
    ]);
    expect(data.options[0]).not.toHaveProperty('share');
    expect(Object.isFrozen(scene.bars[0])).toBe(true);
    expect(buildChoiceBoardScene(CHOICE_BOARD_TEMPLATE).bars.every((bar) => bar.share === 0)).toBe(true);
    for (let count = 2; count <= 6; count += 1) {
      const bars = buildChoiceBoardScene({ options: Array.from({ length: count }, (_, index) => ({
        label: `Simulated ${index}`, votes: index + 1,
      })) }).bars;
      expect(bars.reduce((sum, bar) => sum + bar.share, 0)).toBe(1);
      expect(bars.every((bar) => bar.share >= 0 && bar.share <= 1)).toBe(true);
    }
    expect(buildChoiceBoardScene(data)).toEqual(scene);
  });

  it('keeps shares finite, nonnegative and summing to one for uneven and extreme tallies', () => {
    const tallies = [
      [0, 2, 0], [1, 1, 1, 1, 1, 1], [Number.MAX_SAFE_INTEGER - 5, 1, 1, 1, 1, 1],
      [1, Number.MAX_SAFE_INTEGER - 1], [900719925474099, 1801439850948198, 6305039478313093, 1],
    ];
    for (const votes of tallies) {
      const { bars } = buildChoiceBoardScene({ options: votes.map((count, index) => ({
        label: `Simulated ${index}`, votes: count,
      })) });
      expect(bars.reduce((sum, bar) => sum + bar.share, 0)).toBe(1);
      expect(bars.every((bar) => Number.isFinite(bar.share) && bar.share >= 0 && bar.share <= 1)).toBe(true);
      for (const [index, bar] of bars.entries()) {
        if (votes[index] === 0) expect(bar.share).toBe(0);
      }
    }
  });

  it('refuses fewer than two or more than six options and invalid labels or tallies', () => {
    for (const count of [0, 1, 7]) {
      expect(() => parseChoiceBoard({ options: Array.from({ length: count }, () => ({
        label: 'Simulated option', votes: 0,
      })) })).toThrow(/2 to 6/);
    }
    for (const votes of [-1, 0.1, NaN, Infinity, '2', Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => parseChoiceBoard({ options: [
        { label: 'Simulated first', votes }, { label: 'Simulated second', votes: 0 },
      ] })).toThrow();
    }
    for (const label of ['', '  ', undefined, 1]) {
      expect(() => parseChoiceBoard({ options: [
        { label, votes: 0 }, { label: 'Simulated second', votes: 0 },
      ] })).toThrow();
    }
    expect(() => buildChoiceBoardScene({ options: [
      { label: 'Simulated first', votes: Number.MAX_SAFE_INTEGER },
      { label: 'Simulated second', votes: 1 },
    ] })).toThrow(/total_votes/);
  });

  it('denies unknown fields, including Bits pricing on boards and options', () => {
    for (const key of ['bits', 'cost', 'unexpected']) {
      expect(() => buildChoiceBoardScene({ ...CHOICE_BOARD_TEMPLATE, [key]: 1 })).toThrow(/unknown/i);
      expect(() => parseChoiceBoard({ options: [
        { label: 'Simulated first', votes: 0, [key]: 1 }, { label: 'Simulated second', votes: 0 },
      ] })).toThrow(/unknown/i);
    }
  });

  it('refuses remote or nonlocal option images', () => {
    for (const image_path of ['http://host/a', 'https://host/a', 'data:image/png,x',
      'javascript:alert(1)', '//host/a', '/a', '../a', 'a/../b', 'C:/a', 'a\\b', '', undefined]) {
      expect(() => parseChoiceBoard({ options: [
        { label: 'Simulated first', votes: 0, image_path }, { label: 'Simulated second', votes: 0 },
      ] })).toThrow();
    }
  });
});
