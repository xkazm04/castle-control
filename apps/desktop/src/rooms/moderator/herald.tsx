import type { CSSProperties, ReactNode } from 'react';
import type { ConsensusGetResult } from '@castle-control/contract';
import { art, styles } from '../../demo/model.js';
import { moderationCopy as copy } from '../../moderation-copy.js';
import { library_presets, presetUrl } from '../../custom-design/presets.js';
import type { OutputParameters } from './output-model.js';
import { Consensus } from './consensus.jsx';

type Direction = ConsensusGetResult['directions'][number];
/** `art`: a library vote-bar preset id that replaces the sample art style's housing. */
export type VoteLook = Pick<OutputParameters, 'anchor' | 'size' | 'art_style' | 'colour'> & { art?: string };

/** A 16:9 stream canvas with the vote bar where OBS would show it. A picture, never a source. */
export function VoteBarStage({ directions, look, draft, label }: {
  directions: readonly Direction[]; look: VoteLook; draft?: boolean | undefined; label?: string | undefined;
}) {
  const shown = directions.filter(item => item.key !== 'other').slice(0, 4);
  const total = shown.reduce((sum, item) => sum + item.share, 0) || 1;
  const lead = shown[0];
  const preset = library_presets.find(item => item.id === look.art && item.kind === 'vote_bar');
  const style = preset?.style_name ?? styles.find(item => item.id === look.art_style)?.label ?? look.art_style;
  const bar: CSSProperties & { '--bar-art': string } = { '--bar-art': `url("${preset ? presetUrl(preset) : art(look.art_style, 'votebar')}")` };
  return <figure className="gh-stage" aria-label={`SIMULATED vote bar preview · ${label ?? 'stream canvas'}`}>
    <div className="gh-stage__canvas" data-anchor={look.anchor} data-size={look.size} data-colour={look.colour}>
      <span className="gh-stage__scene" aria-hidden="true">your stream</span>
      <div className="gh-votebar" data-art-style={look.art_style} data-art={preset?.id}>
        <span className="gh-votebar__frame" style={bar}><span className="gh-votebar__track">{shown.map((item, index) => <i key={item.key} data-direction={index}
          style={{ width: `${(item.share / total * 100).toFixed(2)}%` }} title={`${item.label} · ${(item.share * 100).toFixed(1)}%`} />)}</span></span>
        <span className="gh-votebar__legend"><b className="gh-votebar__title">{lead ? `${lead.label} leads` : 'No directions yet'}</b>{shown.map((item, index) => <span key={item.key} data-direction={index}>
          {item.label} <b>{(item.share * 100).toFixed(1)}%</b></span>)}</span>
      </div>
    </div>
    <figcaption><span className="cc-sim">Simulated</span>{draft && <span className="cc-stamp cc-stamp--draft">Draft</span>}
      {look.anchor.replace('-', ' ')} · size {look.size} · {style} · session only, no OBS source</figcaption>
  </figure>;
}

/** The herald: what chat wants, read from passed messages, and the bar viewers would see. */
export function Herald({ results, selected, on_select, look, draft, caption, action }: {
  results: readonly ConsensusGetResult[]; selected: number; on_select: (index: number) => void; look: VoteLook;
  draft?: boolean | undefined; caption?: string | undefined; action?: ReactNode;
}) {
  const result = results[selected] ?? results[0];
  return <section className="gh-herald" aria-labelledby="gh-herald-title">
    <header className="gh-section-head"><h2 id="gh-herald-title" className="cc-section__title">{copy.consensus}<em>{copy.consensus_caption}</em></h2>
      <span className="cc-stamp cc-stamp--local cc-stamp--inked">{copy.illustrative}</span></header>
    <div className="gh-herald__body">
      <Consensus results={results} selected={selected} on_select={on_select} caption={caption} />
      <div className="gh-herald__stage"><h3 className="gh-kicker">Vote bar on stream</h3>
        <VoteBarStage directions={result?.directions ?? []} look={look} draft={draft} label={result ? `counting ${result.filter.kind === 'emote' ? result.filter.emote : result.filter.kind} messages` : undefined} />
        <p className="gh-sm">{copy.output_note}</p>{action}</div>
    </div>
  </section>;
}
