import { chambers, keymap as kitKeymap } from '@castle-control/ui';
import type { ModuleId } from '@castle-control/ui';

type Binding = { key: string; action: ModuleId | 'search' };
export function createKeymap(bindings: readonly Binding[]) {
  const registry = new Map<string, Binding['action']>();
  for (const { key, action } of bindings) {
    if (registry.has(key)) throw new Error(`Duplicate key binding: ${key}`);
    registry.set(key, action);
  }
  return registry;
}

// Consume the kit's single table; the frontend brief assigns / to search.
const registry = createKeymap(kitKeymap.map(({ key, action }) => ({ key, action: action === 'steward' ? 'search' : action })));
type Shortcut = {
  key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean;
  isComposing?: boolean; defaultPrevented?: boolean; repeat?: boolean; preventDefault: () => void;
};
export function dispatchShortcut(event: Shortcut, editable: boolean, navigate: (id: ModuleId) => void, search: () => void) {
  if (editable || event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.defaultPrevented || event.repeat) return;
  const action = registry.get(event.key);
  if (!action) return;
  event.preventDefault();
  if (action === 'search') search();
  else navigate(action);
}

export function routeFromHash(hash: string): ModuleId {
  return chambers.find(chamber => hash === `#/${chamber.id}`)?.id ?? 'lottery';
}
