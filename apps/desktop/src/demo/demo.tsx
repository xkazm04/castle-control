import { useState } from 'react';
import { Stamp } from '@castle-control/ui';
import { SurfaceHead } from '../keep/surface-head.jsx';
import { art, background, frames, initialDemoState, layouts, shots, styles } from './model.js';
import type { DemoState } from './model.js';
import { copy } from './copy.js';
import './demo.css';
import '@castle-control/ui/fused/surface.css';
import '@castle-control/ui/fused/glass.css';

export function DemoControls({ state, on_change }: { state: DemoState; on_change: (next: DemoState) => void }) {
  return <div className="demo-controls">
    <div className="demo-seg"><span id="demo-style">Style</span><div className="cc-seg" role="group" aria-labelledby="demo-style">{styles.map(({ id, label }) =>
      <button type="button" key={id} aria-pressed={state.style === id} onClick={() => on_change({ ...state, style: id })}>{label}</button>)}</div></div>
    <div className="demo-seg"><span id="demo-layout">Layout</span><div className="cc-seg" role="group" aria-labelledby="demo-layout">{layouts.map(({ id, label }) =>
      <button type="button" key={id} aria-pressed={state.layout === id} onClick={() => on_change({ ...state, layout: id })}>{label}</button>)}</div></div>
    <div className="demo-seg"><span id="demo-shot">Malakor</span><div className="cc-seg" role="group" aria-labelledby="demo-shot">{shots.map(({ id, label }) =>
      <button type="button" key={id} aria-pressed={state.shot === id} onClick={() => on_change({ ...state, shot: id })}>{label}</button>)}</div></div>
  </div>;
}

const [chatWord, chatMark] = copy.chatTitle.split(' · ');

// Reconstructed React markup from the atlas stage specification at 7270e60.
// All values are illustrative: no live intake, requests or chamber mutations.
export function DemoPreview({ state }: { state: DemoState }) {
  return <div className="demo-page">
    {/* The broadcast is OBS output, dark art whatever the app theme; the chat and panels follow the theme. */}
    <div className={`stage${state.layout === 'chat' ? ' chatting' : ''}`} data-theme="night">
      <img className="bg" src={background(state)} alt="" />
      <div className="demo-air"><Stamp kind="off-air" word="On air · simulated" /></div>
      <div className="demo-provenance"><Stamp kind="simulated" word={copy.provenance} /></div>
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
    <div className="demo-side">
    <aside className="demo-chat" aria-label="Simulated chat">
      {/* One SIMULATED tag family on the page: the head, the chat header and the stage share the hairline tag. */}
      <header><span>{chatWord}</span><span className="cc-sr"> · </span><span className="cc-sim">{chatMark}</span></header>
      <ol>{copy.chat.map((line, index) => <li key={index}>
        {line.name ? <><span className="n" data-tone={line.tone}>{line.name}</span> {line.text}</>
          : <span className="sys">{line.text}</span>}
      </li>)}</ol>
    </aside>
    <div className="demo-panel-row">{copy.panels.map(panel => <div className="demo-ext" key={panel.asset}>
      <img src={art(state.style, panel.asset)} alt={panel.alt} /><span className="cap">{panel.title}</span><span className="txt">{panel.text}</span>
    </div>)}</div>
    </div>
  </div>;
}

export function DemoHeader({ on_back }: { on_back: () => void }) {
  return <SurfaceHead className="demo-heading" title={copy.title} title_id="demo-title" on_back={on_back}
    subtitle={copy.description} mark={<span className="cc-sim">Simulated</span>} />;
}

export default function Demo({ on_back }: { on_back: () => void }) {
  const [state, setState] = useState<DemoState>(initialDemoState);
  return <section className="demo-workspace" aria-labelledby="demo-title">
    <DemoHeader on_back={on_back} />
    <div className="demo-frame">
      <DemoControls state={state} on_change={setState} />
      <div className="demo-preview-fit"><DemoPreview state={state} /></div>
    </div>
  </section>;
}
