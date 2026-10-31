import { expect, test } from 'vitest';
import { keymap } from '../shell.jsx';
import { DUEL_KEYMAP, duelKeyAction, duelKeymapConflicts } from './keymap.js';

test('duel keys declare every collision with the shell', () => {
  expect(duelKeymapConflicts(keymap)).toEqual([]);
  expect(duelKeymapConflicts(keymap, [{ key: 'Enter', action: 'enter', when: 'always' }]))
    .toEqual(['Enter: enter shadows undeclared open']);
  expect(DUEL_KEYMAP.find(binding => binding.key === 'Escape')).toHaveProperty('shadows', 'back');
  console.log('[duel keymap] 0 conflicts; seeded undeclared Enter: 1 conflict');
});
test('Escape is consumed only during a live duel or verdict', () => {
  for (const phase of ['live', 'verdict']) expect(duelKeyAction({ key: 'Escape' }, { phase })).toBe('cancel');
  for (const phase of ['idle', 'called_off', 'done']) expect(duelKeyAction({ key: 'Escape' }, { phase })).toBeNull();
});
test('native activation, editing, pennants, composition, repeats and modifiers are left alone', () => {
  const phase = 'live';
  const button = { closest: (selector: string) => selector === 'button' ? {} : null };
  expect(duelKeyAction({ key: 'Enter', target: button }, { phase })).toBeNull();
  expect(duelKeyAction({ key: 'Enter', target: { tagName: 'BUTTON' } }, { phase })).toBeNull();
  const editable = { closest: (selector: string) => selector.startsWith('input') ? {} : null };
  expect(duelKeyAction({ key: 'Escape', target: editable }, { phase })).toBeNull();
  const pennant = { closest: (selector: string) => selector.includes('ty-pennants') ? {} : null };
  expect(duelKeyAction({ key: 'ArrowLeft', target: pennant }, { phase })).toBeNull();
  for (const modifier of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey', 'isComposing', 'repeat']) {
    expect(duelKeyAction({ key: 'ArrowRight', [modifier]: true }, { phase })).toBeNull();
  }
  expect(duelKeyAction({ key: 'ArrowLeft' }, { phase })).toBe('pick_left');
  expect(duelKeyAction({ key: 'Backspace' }, { phase })).toBe('undo');
  expect(duelKeyAction({ key: '4' }, { phase })).toBeNull();
});
