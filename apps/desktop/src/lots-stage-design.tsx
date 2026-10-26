import { useEffect, useState, useSyncExternalStore } from 'react';
import { InkButton } from '@castle-control/ui';
import { lotsCopy } from './lots-copy.js';
import { stageCopy as copy } from './lots-stage-copy.js';
import { createDesignPreview, fixturePresets } from './lots-stage-model.js';
import type { FixtureDesign } from './lots-stage-model.js';

export function DesignArtifact({ design }: { design: FixtureDesign }) {
  const shape = lotsCopy.shapes.find(shape => shape.value === design.shape);
  return <div className="lots-stage-artifact" data-ink={design.ink} data-stock={design.stock} role="img" aria-label={`${design.name} · ${shape?.label}`}>
    <span aria-hidden="true">{shape?.glyph}</span><b>{design.name}</b>
  </div>;
}

export function PresetPicker({ design, apply }: { design: FixtureDesign; apply: (design: FixtureDesign) => void }) {
  return <><p>{copy.presets_note}</p><div className="lots-stage-presets" role="group" aria-label={copy.preset}>
    {fixturePresets.map(preset => <div key={preset.id}><DesignArtifact design={preset} />
      <InkButton aria-pressed={design.id === preset.id} onClick={() => apply(preset)}>{preset.name}</InkButton>
    </div>)}
  </div></>;
}

export type CustomDesignProps = {
  design: FixtureDesign; prompt: string; pending?: FixtureDesign; busy: boolean;
  on_prompt: (prompt: string) => void; on_generate: () => void; on_seal: () => void; on_tear: () => void;
};
export function CustomDesignContent(props: CustomDesignProps) {
  return <>
    <p className="lots-notice">{copy.fixture}</p><p>{copy.custom_note}</p>
    <label className="lots-field"><span>{copy.prompt}</span>
      <textarea rows={3} value={props.prompt} placeholder={copy.prompt_hint} onChange={event => props.on_prompt(event.currentTarget.value)} />
    </label>
    <div className="lots-tools"><InkButton disabled={props.busy || !props.prompt.trim()} onClick={props.on_generate}>{copy.generate}</InkButton>
      {props.busy && <span role="status">{copy.generating}</span>}</div>
    <div className="lots-stage-comparison">
      <section aria-label={copy.current}><h3>{copy.current}</h3><DesignArtifact design={props.design} /></section>
      <section aria-label={copy.preview}><h3>{copy.preview}</h3>{props.pending ? <DesignArtifact design={props.pending} /> : <p>{copy.no_preview}</p>}</section>
    </div>
    <div className="lots-tools"><InkButton disabled={!props.pending || props.busy} onClick={props.on_seal}>{copy.seal}</InkButton>
      <InkButton onClick={props.on_tear}>{copy.tear}</InkButton></div>
  </>;
}
export function CustomDesign({ design, apply, discard }: {
  design: FixtureDesign; apply: (design: FixtureDesign) => void; discard: () => void;
}) {
  const [port] = useState(() => createDesignPreview(apply, discard));
  const snapshot = useSyncExternalStore(port.subscribe, port.getSnapshot, port.getSnapshot);
  useEffect(() => () => { port.dispose(); }, [port]);
  return <CustomDesignContent design={design} {...snapshot}
    on_prompt={port.prompt} on_generate={port.generate} on_seal={port.seal} on_tear={port.tear} />;
}
