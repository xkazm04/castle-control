import { useSyncExternalStore } from 'react';
import { answerStep, backStep, keepAnswer, reopenStep, resetFlow, startFlow, walkFlow } from './flow.js';
import type { AnyStewardFlow, FlowChamber, FlowLine, FlowState, StewardFlow } from './flow.js';
import type { StewardChip } from './registry.js';

/** One line of the sheet's conversation. */
export type Beat = {
  id: number;
  at: string;
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
/** The active work step's run: progress while it runs, a plain reason when it failed. */
export type WorkRun = { step: string; status: 'running' | 'failed'; progress: string; error?: string };
export type FlowSession = { flow: AnyStewardFlow; state: FlowState; error?: string; work?: WorkRun };
/** What the chamber picture reads to draw the live draft. */
export type DraftPublication = { flow: string; step: string | null; draft: unknown; simulated: boolean; ready: boolean };
export type DockSnapshot = {
  expanded: boolean;
  popover?: 'actions' | 'flows';
  read_through: number;
  beats: readonly Beat[];
  sessions: Readonly<Partial<Record<FlowChamber, FlowSession>>>;
  drafts: Readonly<Partial<Record<FlowChamber, DraftPublication>>>;
};

const beatLimit = 60;
const failedWork = 'That did not work. Nothing was sealed.';

/**
 * The dock's state lives outside React so it survives chamber changes and
 * remounts, and so a chamber can read the draft without sharing a provider.
 */
export function createDockStore() {
  let snapshot: DockSnapshot = { expanded: false, read_through: 0, beats: [], sessions: {}, drafts: {} };
  let sequence = 0;
  /** One controller per chamber's running work; never in the snapshot. */
  const controllers = new Map<FlowChamber, AbortController>();
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
    if (!session) return;
    const next = change(session);
    // A no-op change keeps the running work instead of restarting it.
    setSession(chamber, next.state === session.state && session.work ? { ...next, work: session.work } : next);
    kick(chamber);
  }
  function stopWork(chamber: FlowChamber) {
    controllers.get(chamber)?.abort();
    controllers.delete(chamber);
  }
  function withoutWork(session: FlowSession): FlowSession {
    const next = { ...session };
    delete next.work;
    return next;
  }
  /** Start the active work step when it has no run yet; a failed run waits for retry(). */
  function kick(chamber: FlowChamber) {
    const session = snapshot.sessions[chamber];
    if (!session || session.state.status !== 'open') { stopWork(chamber); return; }
    const view = walkFlow(session.flow, session.state);
    const step = view.active?.step;
    if (step?.kind !== 'work') {
      if (session.work) { stopWork(chamber); setSession(chamber, withoutWork(session)); }
      return;
    }
    if (session.work?.step === step.id) return;
    stopWork(chamber);
    const controller = new AbortController();
    controllers.set(chamber, controller);
    const current = () => {
      const now = snapshot.sessions[chamber];
      return !controller.signal.aborted && now?.work?.step === step.id && now.state === session.state ? now : undefined;
    };
    setSession(chamber, { ...session, work: { step: step.id, status: 'running', progress: step.prompt } });
    const pending = (async () => step.run(view.active?.before ?? view.draft, { signal: controller.signal,
      progress(text) { const now = current(); if (now?.work) setSession(chamber, { ...now, work: { ...now.work, progress: text } }); } }))();
    pending.then(value => {
      const now = current();
      if (!now) return;
      controllers.delete(chamber);
      const result = answerStep(now.flow, now.state, value);
      setSession(chamber, result.error ? { ...now, work: { step: step.id, status: 'failed', progress: '', error: result.error } }
        : { flow: now.flow, state: result.state });
      kick(chamber);
    }, (error: unknown) => {
      const now = current();
      if (!now) return;
      controllers.delete(chamber);
      setSession(chamber, { ...now, work: { step: step.id, status: 'failed', progress: '',
        error: error instanceof Error && error.message ? error.message : failedWork } });
    });
  }
  const store = {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    expand() { emit({ ...snapshot, expanded: true, read_through: sequence }); },
    collapse() { if (snapshot.expanded) emit({ ...snapshot, expanded: false }); },
    popover(kind?: 'actions' | 'flows') {
      const { popover: previous, ...rest } = snapshot;
      if (previous !== kind) emit({ ...rest, ...(kind ? { popover: kind } : {}) });
    },
    /** Escape consumes exactly one layer; the shell owns the final route back. */
    peel(): boolean {
      if (snapshot.popover) { store.popover(); return true; }
      if (snapshot.expanded) { store.collapse(); return true; }
      return false;
    },
    say(beat: Omit<Beat, 'id' | 'at'> & { at?: string }): number {
      const id = ++sequence;
      emit({ ...snapshot, read_through: snapshot.expanded ? id : snapshot.read_through,
        beats: [...snapshot.beats, { ...beat, id, at: beat.at ?? new Date().toISOString() }].slice(-beatLimit) });
      return id;
    },
    /** Open (or resume) a flow in its chamber and raise the sheet. Opening never acts. */
    open(flow: AnyStewardFlow, raise = true) {
      const current = snapshot.sessions[flow.chamber];
      if (current && current.flow.id === flow.id && current.state.status === 'open') { if (raise) store.expand(); return; }
      stopWork(flow.chamber);
      const intro = flow.intro ?? flow.title;
      // The sheet header carries SIMULATED for the whole flow; the intro stays plain talk.
      const beats = [...snapshot.beats, { id: ++sequence, at: new Date().toISOString(), chamber: flow.chamber,
        who: 'steward' as const, text: intro, ...(flow.simulated ? { simulated: true } : { live: true }) }].slice(-beatLimit);
      const expanded = raise || snapshot.expanded;
      setSession(flow.chamber, { flow, state: startFlow(flow) }, { expanded, beats, read_through: expanded ? sequence : snapshot.read_through });
      kick(flow.chamber);
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
    /** Stop the running work. A reopened step keeps its earlier result; otherwise the step before it reopens. */
    cancel(chamber: FlowChamber) {
      const session = snapshot.sessions[chamber];
      if (!session?.work) return;
      stopWork(chamber);
      const step = session.work.step;
      const state = session.state.editing === step ? keepAnswer(session.state) : backStep(session.flow, session.state);
      setSession(chamber, { flow: session.flow, state });
      // A cancel that has nowhere to go back to leaves the flow on the work card, failed, with a retry.
      if (walkFlow(session.flow, state).active?.step.id === step)
        setSession(chamber, { flow: session.flow, state, work: { step, status: 'failed', progress: '', error: 'Stopped. Nothing was sealed.' } });
      else kick(chamber);
    },
    /** Run a failed work step again. */
    retry(chamber: FlowChamber) {
      const session = snapshot.sessions[chamber];
      if (session?.work?.status !== 'failed') return;
      setSession(chamber, withoutWork(session));
      kick(chamber);
    },
    preview(chamber: FlowChamber): boolean {
      if (!snapshot.drafts[chamber]?.ready) return false;
      store.collapse();
      return true;
    },
    /** Put the draft away. Nothing was sealed, so nothing happened. */
    close(chamber: FlowChamber) {
      const session = snapshot.sessions[chamber];
      if (!session) return;
      stopWork(chamber);
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
          ...(outcome.lines ? { lines: outcome.lines } : {}), ...(outcome.chips?.length ? { chips: outcome.chips } : {}),
          ...(session.flow.simulated ? { simulated: true } : { live: true }) });
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
