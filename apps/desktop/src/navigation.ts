import { chambers, keymap } from '@castle-control/ui';
import type { ModuleId } from '@castle-control/ui';
import type { ActionKey } from '@castle-control/ui/action-row';

type Action = (typeof keymap)[number]['action'];
export type Surface = 'keep' | 'overview' | 'demo';
// Setup has no chamber or Steward context; its shell maps that context to the Keep.
export type ShellSurface = Surface | 'stream' | 'rehearsal';
export type Navigation = { current: ModuleId | ShellSurface; origin: Surface; replay: boolean };
export function createKeymap<T = Action>(bindings: readonly { key: string; action: T }[]) {
  const registry = new Map<string, T>();
  for (const { key, action } of bindings) {
    if (registry.has(key)) throw new Error(`Duplicate key binding: ${key}`);
    registry.set(key, action);
  }
  return registry;
}
const registry = createKeymap(keymap);
type RoomKeys = { entries: readonly ActionKey[]; peel: () => boolean };
let roomKeys: RoomKeys | undefined;
/** Mounted chamber owns the scope; cleanup never removes a newer scope. */
export function registerActionKeys(scope: RoomKeys) {
  roomKeys = scope;
  return () => { if (roomKeys === scope) roomKeys = undefined; };
}
export function actionKeymap(entries: readonly ActionKey[]) {
  return createKeymap(entries.map(entry => ({ key: entry.key.toLowerCase(), action: entry })));
}
type Shortcut = {
  key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean;
  isComposing?: boolean; defaultPrevented?: boolean; repeat?: boolean; preventDefault: () => void;
};
type SurfaceActions = { overview?: () => void; back?: () => void; open?: () => void; tear?: () => void };
export function dispatchShortcut(event: Shortcut, editable: boolean, navigate: (id: ModuleId) => void,
  steward: (() => void) | undefined, actions: SurfaceActions = {}) {
  if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.defaultPrevented || event.repeat) return;
  if (event.key === 'Escape' && roomKeys?.peel()) { event.preventDefault(); return; }
  const room_action = !editable ? actionKeymap(roomKeys?.entries ?? []).get(event.key.toLowerCase()) : undefined;
  if (room_action) { event.preventDefault(); if (!room_action.disabled) room_action.run(); return; }
  const action = registry.get(event.key);
  if (!action || action === 'seal' || (editable && action !== 'back') || event.ctrlKey || event.metaKey ||
    event.altKey || event.isComposing || event.defaultPrevented || event.repeat) return;
  const callback = action === 'steward' ? steward
    : action === 'overview' || action === 'back' || action === 'open' || action === 'tear' ? actions[action]
    : () => navigate(action);
  if (callback) { event.preventDefault(); callback(); }
}

export function canonicalHash(hash: string): string {
  if (hash === '#/keep' || hash === '#/overview' || hash === '#/demo' || hash === '#/stream' || hash === '#/rehearsal') return hash;
  if (hash === '#/moderator/drill' || hash === '#/chamber/moderator/drill') return '#/chamber/moderator/drill';
  for (const { id } of chambers) if (hash === `#/${id}` || hash === `#/chamber/${id}`) return `#/chamber/${id}`;
  return '#/keep';
}
export function routeFromHash(hash: string): ModuleId | ShellSurface {
  const canonical = canonicalHash(hash);
  if (canonical === '#/overview') return 'overview';
  if (canonical === '#/demo') return 'demo';
  if (canonical === '#/stream') return 'stream';
  if (canonical === '#/rehearsal') return 'rehearsal';
  return chambers.find(({ id }) => canonical === `#/chamber/${id}` || canonical === `#/chamber/${id}/drill`)?.id ?? 'keep';
}
export function initialNavigation(hash: string): Navigation {
  return { current: routeFromHash(hash), origin: 'keep', replay: canonicalHash(hash) === '#/chamber/moderator/drill' };
}
export function navigateHash(previous: Navigation, hash: string): Navigation {
  const next = initialNavigation(hash);
  return { ...next, origin: previous.current === 'keep' || previous.current === 'overview' ? previous.current : previous.origin };
}
export function backHash(state: Navigation): string {
  return `#/${state.current === 'keep' || state.current === 'overview' || state.current === 'demo' || state.current === 'stream' || state.current === 'rehearsal' ? 'keep' : state.origin}`;
}
