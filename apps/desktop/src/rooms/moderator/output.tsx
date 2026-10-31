import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ConsensusGetResult, Decision } from '@castle-control/contract';
import { FieldGroup, HeraldicCard, InkButton, SectionHeading, StageFrame, printStyle } from '@castle-control/ui';
import { art, styles } from '../../demo/model.js';
import { moderationCopy as copy } from '../../moderation-copy.js';
import { anchors, colours, playOutputTiming, sizes } from './output-model.js';
import type { OutputLayer, OutputParameters, OutputPhase, OutputPort, OutputSnapshot } from './output-model.js';
import './output.css';

const layerNames = { chat: 'Chat overlay', vote: 'Vote bar' } as const;
const phaseNames = { waiting: copy.output_waiting, visible: copy.output_visible, hidden: copy.output_hidden };
type ConsensusDirection = ConsensusGetResult['directions'][number];

export function OutputSettings({ layer, value, port }: { layer: OutputLayer; value: Readonly<OutputParameters>; port: OutputPort }) {
  const name = layerNames[layer];
  const choices = [
    { field: 'size', label: 'size', values: sizes.map(id => ({ id, label: id })) },
    { field: 'anchor', label: 'anchor', values: anchors.map(id => ({ id, label: id.replaceAll('-', ' ') })) },
    { field: 'colour', label: 'colour', values: colours.map(id => ({ id, label: id === 'key' ? 'Key ink' : id })) },
    { field: 'art_style', label: 'art style', values: styles },
  ] as const;
  return <HeraldicCard className="moderator-output-settings"><h4>{name}</h4>
    {choices.map(({ field, label, values }) => <FieldGroup key={field} label={`${name} ${label}`} control_id={`${layer}-${field}`} variant="select">
      <select id={`${layer}-${field}`} value={value[field]} onChange={event => port.update(layer, field, event.currentTarget.value)}>
        {values.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select></FieldGroup>)}
    {(['show_ms', 'hide_ms'] as const).map(field => <FieldGroup key={field} label={`${name} ${field === 'show_ms' ? 'show after' : 'hide after'} (ms)`}
      control_id={`${layer}-${field}`}>
      <TimingField id={`${layer}-${field}`} layer={layer} field={field} value={value[field]} port={port} />
    </FieldGroup>)}
  </HeraldicCard>;
}

// Keep a temporary edit buffer so empty and multi-digit keyboard edits are possible.
function TimingField({ id, layer, field, value, port }: { id: string; layer: OutputLayer; field: 'show_ms' | 'hide_ms'; value: number; port: OutputPort }) {
  const [draft, setDraft] = useState(String(value));
  // Apply the effective clamped value live without replacing a partial keyboard
  // edit (e.g. the first digit of 1000). Blur displays the effective value.
  return <input id={id} type="number" step={1} min={field === 'show_ms' ? 0 : 250} max={field === 'show_ms' ? 10000 : 60000}
    value={draft} onChange={event => { const next = event.currentTarget.value; setDraft(next); port.update(layer, field, next); }}
    onBlur={() => setDraft(String(port.getSnapshot()[layer][field]))} />;
}

function position(value: Readonly<OutputParameters>, width: number, height: number, layer: OutputLayer) {
  const scale = width / 1920; const w = { S: 440, M: 600, L: 760 }[value.size] * scale;
  const h = (layer === 'chat' ? 280 : 200) * scale; const margin = 32 * scale;
  return { x: value.anchor.endsWith('right') ? width - w - margin : margin,
    y: value.anchor.startsWith('bottom') ? height - h - margin : margin, w, h, scale };
}

export function OutputFrame({ width, settings, messages, directions, phases }: {
  width: 1920 | 1280; settings: OutputSnapshot; messages: readonly Decision[];
  directions: readonly ConsensusDirection[]; phases: Readonly<Record<OutputLayer, OutputPhase>>;
}) {
  const height = width * 9 / 16;
  const passed = messages.filter(message => message.verdict === 'pass' && message.message_text).slice(-3);
  return <StageFrame className="moderator-output-frame" variant="print">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`SIMULATED chat overlay and vote bar · ${width}x${height}`}
      data-output-frame={`${width}x${height}`} data-transparent="true">
      <title>SIMULATED · SAMPLE · transparent canvas · session preview only</title>
      {(['chat', 'vote'] as const).map(layer => {
        const value = settings[layer]; const p = position(value, width, height, layer);
        return <g key={layer} data-output-layer={layer} data-size={value.size} data-anchor={value.anchor} data-art-style={value.art_style}
          data-colour={value.colour} data-phase={phases[layer]} style={printStyle({ ink: value.colour })}
          visibility={phases[layer] === 'visible' ? 'visible' : 'hidden'} transform={`translate(${p.x} ${p.y})`}>
          <rect width={p.w} height={p.h} rx={8 * p.scale} className="moderator-output-backplate" />
          {layer === 'vote' ? <>
            <image href={art(value.art_style, 'votebar')} width={p.w} height={p.h} opacity=".35" preserveAspectRatio="xMidYMid slice" />
            <text x={20 * p.scale} y={40 * p.scale}>SAMPLE vote bar · illustrative</text>
            {directions.slice(0, 4).map((direction, index) => <text key={direction.key} x={20 * p.scale} y={(76 + index * 32) * p.scale}>
              {direction.label} · {(direction.share * 100).toFixed(1)}%</text>)}
            {!directions.length && <text x={20 * p.scale} y={80 * p.scale}>No consensus directions</text>}
          </> : <>
            <text x={20 * p.scale} y={40 * p.scale}>SAMPLE passed chat · {styles.find(style => style.id === value.art_style)?.label}</text>
            {passed.map((message, index) => <text key={message.message_id} x={20 * p.scale} y={(90 + index * 65) * p.scale}>
              <title>{message.message_text}</title>{(message.message_text ?? '').slice(0, 46)}{(message.message_text?.length ?? 0) > 46 ? '…' : ''}</text>)}
            {!passed.length && <text x={20 * p.scale} y={90 * p.scale}>No passed messages</text>}
          </>}
        </g>;
      })}
    </svg><figcaption>{width}×{height} · SIMULATED · transparent canvas</figcaption>
  </StageFrame>;
}

export function OutputPreview({ port, messages, directions }: { port: OutputPort; messages: readonly Decision[]; directions: readonly ConsensusDirection[] }) {
  const settings = useSyncExternalStore(port.subscribe, port.getSnapshot, port.getSnapshot);
  const [run, setRun] = useState(0);
  const [phases, setPhases] = useState<Record<OutputLayer, OutputPhase>>({ chat: 'visible', vote: 'visible' });
  useEffect(() => {
    if (!run) return;
    const stops = (['chat', 'vote'] as const).map(layer => playOutputTiming(settings[layer], phase => setPhases(previous => ({ ...previous, [layer]: phase }))));
    return () => stops.forEach(stop => stop());
  }, [run, settings]);
  return <section className="moderator-block moderator-output" aria-label={copy.output_title}>
    <SectionHeading title={copy.output_title} gloss={copy.simulated_caps} />
    <p className="moderator-small">{copy.output_scope}</p><p className="moderator-small">{copy.output_note}</p>
    {(['chat', 'vote'] as const).map(layer => <OutputSettings key={layer} layer={layer} value={settings[layer]} port={port} />)}
    <p className="moderator-small">{copy.output_limits}</p>
    <InkButton type="button" size="room" onClick={() => setRun(value => value + 1)}>{copy.output_timing}</InkButton>
    <p role="status">Chat overlay: {phaseNames[phases.chat]} · Vote bar: {phaseNames[phases.vote]}</p>
    {([1920, 1280] as const).map(width => <OutputFrame key={width} width={width} settings={settings} messages={messages} directions={directions} phases={phases} />)}
  </section>;
}
