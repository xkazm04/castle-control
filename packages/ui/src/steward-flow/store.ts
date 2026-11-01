import { useSyncExternalStore } from 'react';
import { answerStep, backStep, keepAnswer, reopenStep, resetFlow, startFlow, walkFlow } from './flow.js';
import type { AnyStewardFlow, FlowChamber, FlowLine, FlowState, StewardFlow } from './flow.js';
import type { StewardChip } from './registry.js';

/** One line of the sheet's conversation. */
export type Beat = {
  id: number;
  chamber: FlowChamber;
  who: 'steward' | 'you';
  text: string;
  lines?: readonly FlowLine[];
  chips?: readonly StewardChip[];
  simulated?: boolean;
  live?: boolean;
  /** A seal receipt rather than ordinary talk. */
  sealed?: boolean;
};
export type FlowSession = { flow: AnyStewardFlow; state: FlowState; error?: string };
/** What the chamber picture reads to draw the live draft. */
export type DraftPublication = { flow: string; step: string | null; draft: unknown; simulated: boolean; ready: boolean };
export type DockSnapshot = {
  expanded: boolean;
  beats: readonly Beat[];
  sessions: Readonly<Partial<Record<FlowChamber, FlowSession>>>;
  drafts: Readonly<Partial<Record<FlowChamber, DraftPublication>>>;
};

const beatLimit = 60;

/**
 * The dock's state lives outside React so it survives chamber changes and
 * remounts, and so a chamber can read the draft without sharing a provider.
 */
export function createDockStore() {
  let snapshot: DockSnapshot = { expanded: false, beats: [], sessions: {}, drafts: {} };
  let sequence = 0;
  const listeners = new Set<() => void>();
  const emit = (next: DockSnapshot) => { snapshot = next; for (const listener of listeners) listener(); };
  function publish(sessions: DockSnapshot['sessions'], chamber: FlowChamber): DockSnapshot['drafts'] {
    const session = sessions[chamber];
    const drafts = { ...snapshot.drafts };
    if (!session || session.state.status === 'sealed') { delete drafts[chamber]; return drafts; }
    const view = walkFlow(session.flow, session.state);
    drafts[chamber] = { flow: session.flow.id, step: view.active?.step.id ?? null, draft: view.draft,
      simulated: session.flow.simulated === true, ready: view.ready };
    return drafts;
  }
  function setSession(chamber: FlowChamber, session: FlowSession | undefined, extra: Partial<DockSnapshot> = {}) {
    const sessions = { ...snapshot.sessions };
    if (session) sessions[chamber] = session; else delete sessions[chamber];
    emit({ ...snapshot, ...extra, sessions, drafts: publish(sessions, chamber) });
  }
  function update(chamber: FlowChamber, change: (session: FlowSession) => FlowSession) {
    const session = snapshot.sessions[chamber];
    if (session) setSession(chamber, change(session));
  }
  const store = {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    expand() { if (!snapshot.expanded) emit({ ...snapshot, expanded: true }); },
    collapse() { if (snapshot.expanded) emit({ ...snapshot, expanded: false }); },
    say(beat: Omit<Beat, 'id'>): number {
      const id = ++sequence;
      emit({ ...snapshot, beats: [...snapshot.beats, { ...beat, id }].slice(-beatLimit) });
      return id;
    },
    /** Open (or resume) a flow in its chamber and raise the sheet. Opening never acts. */
    open(flow: AnyStewardFlow) {
      const current = snapshot.sessions[flow.chamber];
      if (current && current.flow.id === flow.id && current.state.status === 'open') { store.expand(); return; }
      const intro = flow.intro ?? flow.title;
      // The sheet header carries SIMULATED for the whole flow; the intro stays plain talk.
      const beats = [...snapshot.beats, { id: ++sequence, chamber: flow.chamber, who: 'steward' as const, text: intro }].slice(-beatLimit);
      setSession(flow.chamber, { flow, state: startFlow(flow) }, { expanded: true, beats });
    },
    answer(chamber: FlowChamber, value: string) {
      update(chamber, session => {
        const result = answerStep(session.flow, session.state, value);
        return { flow: session.flow, state: result.state, ...(result.error ? { error: result.error } : {}) };
      });
    },
    reopen(chamber: FlowChamber, step: string) { update(chamber, ({ flow, state }) => ({ flow, state: reopenStep(flow, state, step) })); },
    keep(chamber: FlowChamber) { update(chamber, ({ flow, state }) => ({ flow, state: keepAnswer(state) })); },
    back(chamber: FlowChamber) { update(chamber, ({ flow, state }) => ({ flow, state: backStep(flow, state) })); },
    reset(chamber: FlowChamber) { update(chamber, ({ flow, state }) => ({ flow, state: resetFlow(state) })); },
    /** Put the draft away. Nothing was sealed, so nothing happened. */
    close(chamber: FlowChamber) {
      const session = snapshot.sessions[chamber];
      if (!session) return;
      setSession(chamber, undefined);
      if (session.state.status !== 'sealed') store.say({ chamber, who: 'steward', text: `Put away "${session.flow.title}". Nothing was sealed.` });
    },
    /** The only path to a flow's seal(). Called by the confirm card's hold. */
    async seal(chamber: FlowChamber) {
      const session = snapshot.sessions[chamber];
      if (!session || session.state.status !== 'open') return;
      const view = walkFlow(session.flow, session.state);
      if (!view.ready) return;
      setSession(chamber, { flow: session.flow, state: { ...session.state, status: 'sealing' } });
      try {
        const outcome = await session.flow.seal(view.draft);
        setSession(chamber, undefined);
        store.say({ chamber, who: 'steward', text: outcome.say, sealed: true,
          ...(outcome.lines ? { lines: outcome.lines } : {}), ...(session.flow.simulated ? { simulated: true } : {}) });
      } catch {
        setSession(chamber, { flow: session.flow, state: { ...session.state, status: 'open' },
          error: 'The seal did not take. Nothing changed. Hold again when ready.' });
      }
    },
  };
  return store;
}
export type DockStore = ReturnType<typeof createDockStore>;

/** The app's one dock. Chambers read drafts from it; only the dock writes. */
export const stewardDock = createDockStore();

/** Live draft for a chamber picture, or undefined when no flow is open there. */
export function useStewardDraft(chamber: FlowChamber, store: DockStore = stewardDock): DraftPublication | undefined {
  const read = () => store.getSnapshot().drafts[chamber];
  return useSyncExternalStore(store.subscribe, read, read);
}

/** Typed draft of one flow: undefined unless that flow is the one open in its chamber. */
export function useFlowDraft<D>(flow: StewardFlow<D>, store: DockStore = stewardDock): D | undefined {
  const publication = useStewardDraft(flow.chamber, store);
  // The publication was produced by this very flow's walk, so its draft is a D.
  return publication?.flow === flow.id ? publication.draft as D : undefined;
}
