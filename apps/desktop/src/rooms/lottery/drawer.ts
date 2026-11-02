/** Detail visibility belongs to the room's existing session/port, never to a draw's wire state. */
const drawers = new WeakMap<object, ReturnType<typeof createDrawer>>();
function createDrawer() {
  let open = false;
  const listeners = new Set<() => void>();
  const set = (next: boolean) => {
    if (open === next) return;
    open = next;
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => open,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    open: () => set(true), close: () => set(false),
  };
}
export function lotDrawer(owner: object) {
  let drawer = drawers.get(owner);
  if (!drawer) { drawer = createDrawer(); drawers.set(owner, drawer); }
  return drawer;
}
