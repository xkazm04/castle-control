import { Children, cloneElement, isValidElement, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { ProposalCard } from '@castle-control/ui';
import { DesignFocus, DesignSession } from '@castle-control/ui/design';
import type { ArtifactId, DesignSnapshot } from '@castle-control/ui/design';
import { ProposalQueue } from '@castle-control/ui/steward';
import type { Proposal } from '@castle-control/ui/steward';
import { RoomDesignProposalView } from './focus.jsx';

function draft(session: DesignSession, artifact: ArtifactId): Proposal {
  const result = session.draft({ action: 'custom', artifact, prompt: 'simulated quiet engraved' });
  if (!result.ok) throw new Error(result.reason);
  return result.proposal;
}

type View = ReturnType<typeof RoomDesignProposalView>;
type CardProps = { on_tear: () => void; on_seal: () => void };

function card(view: View): CardProps {
  const child = Children.toArray(view.props.children).find(child => isValidElement(child) && child.type === ProposalCard);
  if (!isValidElement<CardProps>(child)) throw new Error('Missing proposal card');
  return child.props;
}

function preview(view: View) {
  const child = Children.toArray(view.props.children).find(child => isValidElement<{ children?: string }>(child)
    && child.type === 'button' && child.props.children === 'Preview draft');
  if (!isValidElement<{ onClick: () => void }>(child)) throw new Error('Missing preview button');
  child.props.onClick();
}

/** Invoke real view handlers under React's server dispatcher. A render-phase
 * update preserves the view's hooks without a DOM shim or a mocked session. */
function renderViews(session: DesignSession, items: readonly [Proposal, ArtifactId][],
  act?: (views: readonly View[]) => void, snapshot?: DesignSnapshot) {
  function Probe() {
    const [acted, setActed] = useState(false);
    const views = items.map(([proposal, artifact]) => RoomDesignProposalView({
      proposal, artifact, session, snapshot: snapshot ?? session.getSnapshot(), focused: true, on_open: vi.fn(),
    }));
    if (!acted && act) { act(views); setActed(true); }
    return <>{views.map((view, index) => cloneElement(view, { key: index }))}</>;
  }
  return renderToStaticMarkup(<Probe />);
}

function viewAt(views: readonly View[], index = 0): View {
  const view = views[index];
  if (!view) throw new Error('Missing proposal view');
  return view;
}

const alerts = (html: string) => html.match(/role="alert"/g) ?? [];

test('a session error is not repeated per proposal', () => {
  const session = new DesignSession(new ProposalQueue());
  try {
    const beacon = draft(session, 'beacon');
    const overlay = draft(session, 'overlay');
    session.preview(beacon.id);
    const html = renderViews(session, [[beacon, 'beacon'], [overlay, 'overlay']], views => {
      // The hold captured this preview before another edit invalidated it.
      session.amend(beacon.id, { action: 'custom', artifact: 'beacon', prompt: 'simulated bold plain' });
      card(viewAt(views)).on_seal();
    });
    expect(alerts(html)).toHaveLength(1);
    const overlay_view = html.split('<section class="room-design-proposal"')[2];
    expect(overlay_view).toBeDefined();
    expect(alerts(overlay_view ?? '')).toHaveLength(0);
    expect(html).toContain('This preview is stale. Preview again before sealing.');
  } finally { session.dispose(); }
});

test('an error from another proposal is not shown', () => {
  const session = new DesignSession(new ProposalQueue());
  try {
    const beacon = draft(session, 'beacon');
    const map = draft(session, 'map');
    const result = session.preview(beacon.id);
    if (!result.ok) throw new Error(result.reason);
    session.amend(beacon.id, { action: 'custom', artifact: 'beacon', prompt: 'simulated bold plain' });
    expect(session.seal(result.preview).ok).toBe(false);
    expect(alerts(renderViews(session, [[map, 'map']]))).toHaveLength(0);
    // The shared dialog retains the session-wide error by design.
    const dialog = renderToStaticMarkup(<DesignFocus artifact="map" session={session} />);
    expect(alerts(dialog)).toHaveLength(1);
    expect(dialog).toContain('This preview is stale. Preview again before sealing.');
  } finally { session.dispose(); }
});

test('own failure is shown', () => {
  const session = new DesignSession(new ProposalQueue());
  try {
    const beacon = draft(session, 'beacon');
    const snapshot = session.getSnapshot();
    expect(session.tearUp(beacon.id).ok).toBe(true);
    // Even before a fresh subscription snapshot arrives, use the action result.
    const html = renderViews(session, [[beacon, 'beacon']], views => card(viewAt(views)).on_tear(), snapshot);
    expect(alerts(html)).toHaveLength(1);
    expect(html).toContain(session.getSnapshot().error);
  } finally { session.dispose(); }
});

test('a reused proposal view does not carry its error into another room', () => {
  const session = new DesignSession(new ProposalQueue());
  try {
    const beacon = draft(session, 'beacon');
    const map = draft(session, 'map');
    session.tearUp(beacon.id);
    function Probe() {
      const [moved, setMoved] = useState(false);
      const view = RoomDesignProposalView({ proposal: moved ? map : beacon, artifact: moved ? 'map' : 'beacon',
        focused: true, on_open: vi.fn(), session, snapshot: session.getSnapshot() });
      if (!moved) { card(view).on_tear(); setMoved(true); }
      return view;
    }
    expect(alerts(renderToStaticMarkup(<Probe />))).toHaveLength(0);
  } finally { session.dispose(); }
});

test('preview failure stays beside its proposal and a successful retry clears it', () => {
  const session = new DesignSession(new ProposalQueue());
  try {
    const beacon = draft(session, 'beacon');
    const overlay = draft(session, 'overlay');
    session.queue.amend(beacon.id, [{ key: 'ink', value: 'invalid' }]);
    const failed = renderViews(session, [[beacon, 'beacon'], [overlay, 'overlay']], views => preview(viewAt(views)));
    expect(alerts(failed)).toHaveLength(1);
    function Retry() {
      const [step, setStep] = useState(0);
      const view = RoomDesignProposalView({ proposal: beacon, artifact: 'beacon', focused: true, on_open: vi.fn(),
        session, snapshot: session.getSnapshot() });
      if (step === 0) { preview(view); setStep(1); }
      if (step === 1) {
        session.amend(beacon.id, { action: 'custom', artifact: 'beacon', prompt: 'simulated quiet engraved' });
        preview(view); setStep(2);
      }
      return view;
    }
    expect(alerts(renderToStaticMarkup(<Retry />))).toHaveLength(0);
  } finally { session.dispose(); }
});
