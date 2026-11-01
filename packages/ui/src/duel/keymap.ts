export type DuelKeyAction = 'pick_left' | 'pick_right' | 'cancel' | 'enter' | 'undo' | 'mode_prev' | 'mode_next';
export interface DuelBinding {
  readonly key: string;
  readonly action: DuelKeyAction;
  readonly when: 'live' | 'always';
  readonly shadows?: string;
}
export const DUEL_KEYMAP = [
  { key: 'ArrowLeft', action: 'pick_left', when: 'live' },
  { key: 'ArrowRight', action: 'pick_right', when: 'live' },
  { key: 'Escape', action: 'cancel', when: 'live', shadows: 'back' },
  { key: 'Enter', action: 'enter', when: 'always', shadows: 'open' },
  { key: 'Backspace', action: 'undo', when: 'always' },
  { key: '[', action: 'mode_prev', when: 'always' },
  { key: ']', action: 'mode_next', when: 'always' },
] as const satisfies readonly DuelBinding[];

export interface DuelKeyEvent {
  readonly key: string;
  readonly target?: object | null;
  readonly repeat?: boolean;
  readonly isComposing?: boolean;
  readonly altKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly shiftKey?: boolean;
}
function hasClosest(target: object | null | undefined): target is { closest(selector: string): object | null } {
  return !!target && 'closest' in target && typeof target.closest === 'function';
}
export function duelKeyAction(event: DuelKeyEvent, state: { readonly phase: string }): DuelKeyAction | null {
  if (event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null;
  const target = event.target;
  const element = hasClosest(target) ? target : null;
  const tag = target && 'tagName' in target && typeof target.tagName === 'string' ? target.tagName.toUpperCase() : '';
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return null;
  if (element?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return null;
  if (target && 'isContentEditable' in target && target.isContentEditable) return null;
  if (event.key === 'Enter' && (tag === 'BUTTON' || element?.closest('button'))) return null;
  if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && element?.closest('[data-role="ty-pennants"]')) return null;
  const binding = DUEL_KEYMAP.find(binding => binding.key === event.key);
  if (!binding || (binding.when === 'live' && state.phase !== 'live' && state.phase !== 'verdict')) return null;
  return binding.action;
}

export function duelKeymapConflicts(shell_keymap: readonly { readonly key: string; readonly action: string }[],
  duel_keymap: readonly DuelBinding[] = DUEL_KEYMAP): string[] {
  return duel_keymap.flatMap(binding => shell_keymap
    .filter(shell => shell.key === binding.key && binding.shadows !== shell.action)
    .map(shell => `${binding.key}: ${binding.action} shadows undeclared ${shell.action}`));
}
