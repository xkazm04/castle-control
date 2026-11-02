/**
 * Session-only view state of the Gatehouse room that the Steward's flows may set on seal:
 * which herald count the vote bar follows, whether the "More" benches are open, the
 * Play demo's moved herald, and a practice drill plan. Nothing here reaches chat or OBS.
 */
export type DrillPlan = { busy: boolean; compare: boolean };
export type RoomView = { filter: number; more: boolean; demo_moved: boolean; drill?: DrillPlan };

export function createRoomView() {
  let state: RoomView = { filter: 0, more: false, demo_moved: false };
  const listeners = new Set<() => void>();
  const set = (patch: Partial<RoomView>) => {
    const next = { ...state, ...patch };
    if ((Object.keys(patch) as (keyof RoomView)[]).every(key => next[key] === state[key])) return;
    state = next;
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setFilter(filter: number) { set({ filter }); },
    setMore(more: boolean) { set({ more }); },
    setDemoMoved(demo_moved: boolean) { set({ demo_moved }); },
    planDrill(drill: DrillPlan) { set({ drill }); },
    /** The drill read its plan; a later visit opens as recorded. */
    takeDrill(): DrillPlan | undefined {
      const drill = state.drill;
      if (drill) state = { filter: state.filter, more: state.more, demo_moved: state.demo_moved };
      return drill;
    },
  };
}
export type RoomViewPort = ReturnType<typeof createRoomView>;
