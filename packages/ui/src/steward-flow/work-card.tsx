import type { FlowEntry } from './flow.js';
import type { WorkRun } from './store.js';

/** The active work step: progress while it runs (with a cancel), or the plain reason and a retry. */
export function WorkCard({ entry, work, on_cancel, on_retry, on_back }: {
  entry: FlowEntry<unknown>; work: WorkRun | undefined;
  on_cancel: () => void; on_retry: () => void; on_back: () => void;
}) {
  const step = entry.step;
  if (step.kind !== 'work') return null;
  const note = step.note?.(entry.before);
  if (work?.status === 'failed') return <div className="cc-steward-work" data-status="failed">
    <p className="cc-steward-field__error" role="alert">{work.error}</p>
    <div className="cc-steward-card-actions">
      <button type="button" className="cc-btn cc-btn--primary" data-autofocus onClick={on_retry}>Try again</button>
      <button type="button" className="cc-btn cc-btn--quiet" onClick={on_back}>Change something</button>
    </div>
  </div>;
  return <div className="cc-steward-work" data-status="running" aria-busy="true">
    <p className="cc-steward-work__progress" role="status"><i className="cc-steward-work__spinner" aria-hidden="true" />
      {work?.progress ?? step.prompt}</p>
    {note && <p className="cc-steward-work__note">{note}</p>}
    <div className="cc-steward-card-actions">
      <button type="button" className="cc-btn cc-btn--quiet" data-autofocus onClick={on_cancel}>Cancel</button>
    </div>
  </div>;
}
