import { useState } from 'react';
import { InkButton } from '@castle-control/ui';
import { art, background, frames, initialDemoState, layouts, shots, styles } from './model.js';
import type { DemoState } from './model.js';
import { copy } from './copy.js';
import './demo.css';

export function DemoControls({ state, on_change }: { state: DemoState; on_change: (next: DemoState) => void }) {
  return <div className="demo-controls">
    <div className="demo-seg" role="group" aria-label="Style"><span>Style</span>{styles.map(({ id, label }) =>
      <InkButton key={id} aria-pressed={state.style === id} onClick={() => on_change({ ...state, style: id })}>{label}</InkButton>)}</div>
    <div className="demo-seg" role="group" aria-label="Layout"><span>Layout</span>{layouts.map(({ id, label }) =>
      <InkButton key={id} aria-pressed={state.layout === id} onClick={() => on_change({ ...state, layout: id })}>{label}</InkButton>)}</div>
    <div className="demo-seg" role="group" aria-label="Malakor"><span>Malakor</span>{shots.map(({ id, label }) =>
      <InkButton key={id} aria-pressed={state.shot === id} onClick={() => on_change({ ...state, shot: id })}>{label}</InkButton>)}</div>
  </div>;
}

// Reconstructed React markup from the atlas stage specification at 7270e60.
// All values are illustrative: no live intake, requests or chamber mutations.
export function DemoPreview({ state }: { state: DemoState }) {
  return <div className="demo-page" data-theme="stock">
    <div className={`stage${state.layout === 'chat' ? ' chatting' : ''}`}>
      <img className="bg" src={background(state)} alt="" />
      <span className="live">LIVE</span><span className="sim">{copy.provenance}</span>
      <div className="ov o-vote"><img src={art(state.style, 'votebar')} alt="Vote bar" />
        <span className="plate">Gatehouse vote · Raze the mill <em>62%</em> · Spare it <em>38%</em> · <em>0:41</em></span></div>
      <div className="ov o-altar"><img src={art(state.style, 'altar')} alt="Hype altar" />
        <span className="plate">Beacons · blaze <em>54%</em></span></div>
      <div className="ov o-urn"><img src={art(state.style, 'urn')} alt="Draw urn" />
        <span className="plate">Lot draw · <em>128</em> tickets</span></div>
      <div className="ov o-map"><img src={art(state.style, 'hexmap')} alt="Realm map" />
        <span className="plate">Map Room · <em>7</em> of 31 held</span></div>
      <div className="cam" hidden={state.layout === 'chat'}>
        <img className="shot" src={`/art/${state.shot}.webp`} alt="Malakor on camera" />
        <img className="frame" src={frames[state.style]} alt="" />
        <span className="plate">{copy.camera}</span>
      </div>
    </div>
    <aside className="demo-chat" aria-label="Simulated chat">
      <header>{copy.chatTitle}</header>
      <ol>{copy.chat.map((line, index) => <li key={index}>
        {line.name ? <><span className="n" data-tone={line.tone}>{line.name}</span> {line.text}</>
          : <span className="sys">{line.text}</span>}
      </li>)}</ol>
    </aside>
    <div className="demo-panel-row">{copy.panels.map(panel => <div className="demo-ext" key={panel.asset}>
      <span className="cap">{panel.title}</span><img src={art(state.style, panel.asset)} alt={panel.alt} />{panel.text}
    </div>)}</div>
  </div>;
}

export function DemoHeader({ on_back }: { on_back: () => void }) {
  return <header className="demo-heading"><div><h1 id="demo-title">{copy.title}</h1><p>{copy.description}</p></div>
    <InkButton onClick={on_back}>{copy.back} <kbd>Esc</kbd></InkButton></header>;
}

export default function Demo({ on_back }: { on_back: () => void }) {
  const [state, setState] = useState<DemoState>(initialDemoState);
  return <section className="demo-workspace" aria-labelledby="demo-title">
    <DemoHeader on_back={on_back} />
    <DemoControls state={state} on_change={setState} />
    <DemoPreview state={state} />
  </section>;
}
