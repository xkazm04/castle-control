import { useState, useSyncExternalStore } from 'react';
import { DraftFrame } from '../draft-frame.jsx';
import { SealButton } from '../seal-button.jsx';
import { StatusChip } from '../chips.jsx';
import { isPending } from '../steward/queue.js';
import type { ArtifactId } from './catalog.js';
import { artPreviewsFor, defaultPreset, presetsFor } from './catalog.js';
import { DesignScene } from './scene.jsx';
import { designSession } from './session.js';
import type { DesignSession, DesignSnapshot } from './session.js';
import './focus.css';

export interface DesignFocusProps {
  readonly artifact: ArtifactId;
  readonly proposal_id?: string;
  readonly session?: DesignSession;
}

/** Lazy room mount: import this subpath only after entering an artifact's design focus. */
export function DesignFocus({ artifact, proposal_id, session = designSession }: DesignFocusProps) {
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  return <DesignFocusView key={artifact} artifact={artifact} {...(proposal_id === undefined ? {} : { proposal_id })}
    session={session} snapshot={snapshot} />;
}

export function DesignFocusView({ artifact, proposal_id, session, snapshot }: {
  artifact: ArtifactId; proposal_id?: string; session: DesignSession; snapshot: DesignSnapshot;
}) {
  const proposal = snapshot.queue.proposals.find(item => item.id === (proposal_id ?? snapshot.queue.selected_proposal_id)
    && item.fields.some(field => field.key === 'artifact' && field.value === artifact));
  const preview = proposal ? snapshot.previews[proposal.id] : undefined;
  const pending = proposal !== undefined && isPending(proposal);
  const ready = preview !== undefined && session.canSeal(preview);
  return <section className="cc-design-focus" aria-label={`${artifact} design focus`}>
    <header><h2>Design · {artifact}</h2><strong>SIMULATED · SAMPLE DATA</strong></header>
    <p>Fixture preview only. Generation and preview leave the current look intact.</p>
    <div className="cc-design-comparison">
      <section aria-label="Current look"><h3>Current look · rev {snapshot.looks[artifact].revision}</h3>
        <DesignScene output={snapshot.looks[artifact].output} /></section>
      <section aria-label="Draft look"><DraftFrame>
        <h3>Draft look{proposal ? ` · rev ${proposal.revision}` : ''}</h3>
        {preview && pending ? <DesignScene output={preview.output} /> : <p>Choose Restyle or Custom design, then preview the draft.</p>}
        {preview && pending && !ready && <p role="status">Stale draft · preview again.</p>}
        {proposal && !pending && <p role="status">Proposal {proposal.state}.</p>}
      </DraftFrame></section>
    </div>
    {snapshot.error && <p role="alert">{snapshot.error}</p>}
    <DesignControls key={artifact} artifact={artifact} on_restyle={preset_id => session.draft({ action: 'restyle', artifact, preset_id })}
      on_custom={prompt => session.draft({ action: 'custom', artifact, prompt })} />
    <ArtStyleGallery artifact={artifact} />
    {pending && <div className="cc-design-actions">
      <button type="button" onClick={() => session.preview(proposal.id)}>Preview draft</button>
      <SealButton key={`${proposal.id}:${proposal.revision}:${preview?.base_revision}:${ready}`} variant="proclaim" disabled={!ready}
        on_seal={() => { if (preview) session.seal(preview); }} />
      <button type="button" onClick={() => session.tearUp(proposal.id)}>Tear it up</button>
    </div>}
    <p>Seal applies exactly the previewed revision to this simulated look. Room and live engine wiring follow separately.</p>
  </section>;
}

function ArtStyleGallery({ artifact }: { artifact: ArtifactId }) {
  return <section className="cc-design-art" aria-label="Art styles">
    <header><h3>Art styles</h3><StatusChip variant="dash">SIMULATED</StatusChip></header>
    <p>Sample previews only. These art styles do not change a design or its proposal.</p>
    <div className="cc-design-art-grid">
      {artPreviewsFor(artifact).map(preview => <figure key={preview.src}>
        <div className="cc-design-art-image"><ArtPreviewImage src={preview.src} alt={preview.alt} /></div>
        <figcaption><h4>{preview.label}</h4><p>{preview.thesis}</p>
          <div className="cc-design-art-labels"><StatusChip variant="dash">SAMPLE ART</StatusChip><span>AI-generated</span></div>
        </figcaption>
      </figure>)}
    </div>
  </section>;
}

/** Remove an unavailable image entirely so the browser never retains a broken icon. */
export function ArtPreviewImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? <p role="status">not available</p>
    : <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}

export function DesignControls({ artifact, on_restyle, on_custom }: {
  artifact: ArtifactId; on_restyle: (preset_id: string) => void; on_custom: (prompt: string) => void;
}) {
  const [preset, setPreset] = useState(defaultPreset(artifact).id);
  const [prompt, setPrompt] = useState('');
  return <div className="cc-design-controls">
    <label>Preset<select value={preset} onChange={event => setPreset(event.currentTarget.value)}>
      {presetsFor(artifact).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select></label>
    <button type="button" onClick={() => on_restyle(preset)}>Restyle</button>
    <label>Describe a style<input value={prompt} maxLength={200} placeholder="A quiet engraved look"
      onChange={event => setPrompt(event.currentTarget.value)} /></label>
    <button type="button" disabled={!prompt.trim()} onClick={() => on_custom(prompt)}>Custom design</button>
  </div>;
}
