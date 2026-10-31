import type { Event } from './machine.ts';
import { chamberIds } from './route.ts';

const keyboardEvent = 'keydown';
export type Context = Readonly<{ level: 0 | 1 | 2 }>;
export type Action = Event | { type: 'focus'; direction: -1 | 1 };
export type Binding = Readonly<{ key: string; when: readonly Context['level'][]; action: Action }>;
const all = [0, 1, 2] as const;

export const keymap: readonly Binding[] = [
  ...chamberIds.map((room, index): Binding => ({
    key: String(index + 1), when: all, action: { type: 'open', room },
  })),
  { key: '0', when: all, action: { type: 'home' } },
  { key: 'Escape', when: all, action: { type: 'back' } },
  { key: 'ArrowLeft', when: [1, 2], action: { type: 'cycle', direction: -1 } },
  { key: 'ArrowRight', when: [1, 2], action: { type: 'cycle', direction: 1 } },
  { key: 'ArrowLeft', when: [0], action: { type: 'focus', direction: -1 } },
  { key: 'ArrowRight', when: [0], action: { type: 'focus', direction: 1 } },
];

export function checkConflicts(bindings: readonly Binding[]): void {
  const slots = new Set<string>();
  for (const binding of bindings) for (const depth of binding.when) {
    const slot = `${depth}:${binding.key}`;
    if (slots.has(slot)) throw new Error(`Conflicting landing shortcut: ${slot}`);
    slots.add(slot);
  }
}
checkConflicts(keymap);

export type KeyInput = Readonly<{
  key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean;
  isComposing?: boolean; repeat?: boolean;
}>;
export type KeyTarget = Readonly<{ tagName: string; isContentEditable?: boolean }>;

export function editable(target: KeyTarget | null): boolean {
  return target !== null && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable === true);
}

export function resolveKey(input: KeyInput, context: Context, editing = false): Action | 'blur' | null {
  if (input.ctrlKey || input.metaKey || input.altKey || input.shiftKey || input.isComposing || input.repeat) return null;
  if (editing) return input.key === 'Escape' ? 'blur' : null;
  return keymap.find((binding) => binding.key === input.key && binding.when.includes(context.level))?.action ?? null;
}

export function bindKeys(
  document: Document, context: () => Context, act: (action: Action) => void,
  input: (key: string, target: EventTarget | null) => void,
): () => void {
  const listen = (event: KeyboardEvent): void => {
    input(event.key, event.target);
    const target = event.target instanceof document.defaultView!.HTMLElement ? event.target : null;
    const action = resolveKey(event, context(), editable(target));
    if (action === 'blur') target?.blur();
    else if (action !== null) { event.preventDefault(); act(action); }
  };
  document.addEventListener(keyboardEvent, listen);
  return () => document.removeEventListener(keyboardEvent, listen);
}
