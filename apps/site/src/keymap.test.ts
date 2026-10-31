import { expect, test } from 'vitest';
import { checkConflicts, editable, keymap, resolveKey } from './keymap.ts';

test('conflicts throw for overlapping contexts; disjoint arrows are valid', () => {
  expect(() => checkConflicts(keymap)).not.toThrow();
  expect(() => checkConflicts([...keymap, { key: '1', when: [0], action: { type: 'home' } }])).toThrow('Conflicting');
  expect(() => checkConflicts([{ key: 'x', when: [0, 0], action: { type: 'home' } }])).toThrow('Conflicting');
});

test('1–4, 0 and Escape have one meaning at every level', () => {
  for (const level of [0, 1, 2] as const) {
    ['lots', 'gate', 'beacons', 'map'].forEach((room, index) => {
      expect(resolveKey({ key: String(index + 1) }, { level })).toEqual({ type: 'open', room });
    });
    expect(resolveKey({ key: '0' }, { level })).toEqual({ type: 'home' });
    expect(resolveKey({ key: 'Escape' }, { level })).toEqual({ type: 'back' });
  }
});

test('arrows move overview focus and cycle open rooms while keeping the level', () => {
  for (const level of [0, 1, 2] as const) for (const [key, direction] of [['ArrowLeft', -1], ['ArrowRight', 1]] as const) {
    expect(resolveKey({ key }, { level })).toEqual({ type: level === 0 ? 'focus' : 'cycle', direction });
  }
  for (const key of ['Tab', 'Enter', ' ', 'x']) expect(resolveKey({ key }, { level: 0 })).toBeNull();
});

test('inputs, textareas, selects and inherited contenteditable exclude shortcuts; Escape blurs', () => {
  for (const target of [{ tagName: 'INPUT' }, { tagName: 'TEXTAREA' }, { tagName: 'SELECT' }, { tagName: 'SPAN', isContentEditable: true }]) {
    expect(editable(target)).toBe(true);
    expect(resolveKey({ key: '1' }, { level: 0 }, editable(target))).toBeNull();
    expect(resolveKey({ key: 'Escape' }, { level: 1 }, editable(target))).toBe('blur');
  }
  expect(editable({ tagName: 'BUTTON' })).toBe(false);
  expect(editable(null)).toBe(false);
});

test('modifiers, composition and repeat cannot navigate or blur editable targets', () => {
  for (const guard of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey', 'isComposing', 'repeat'] as const) {
    expect(resolveKey({ key: '1', [guard]: true }, { level: 0 })).toBeNull();
    expect(resolveKey({ key: 'Escape', [guard]: true }, { level: 1 }, true)).toBeNull();
  }
});
