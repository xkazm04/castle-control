import { DraftFrame } from '@castle-control/ui';
import type { ModuleId } from '@castle-control/ui';
import { isPending } from '@castle-control/ui/steward';
import type { Proposal } from '@castle-control/ui/steward';
import type { ReactNode } from 'react';
import { ChamberArt } from '../keep/art.jsx';
import { illustrativeSceneLabel, illustrativeTiles, sceneChat, sceneConsensus } from './fixture.js';
import './scene.css';

export function CryptBackdrop() {
  return <svg className="overview-crypt" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <path d="M0 0h1600v900H0Z" fill="var(--paper-2)" />
    <path d="M120 800V220Q800-130 1480 220v580Z" fill="var(--hair-2)" stroke="var(--ink-2)" strokeWidth="8" />
    {[180, 540, 1020, 1380].map(x => <g key={x}><path d={`M${x} 70v690`} stroke="var(--line)" strokeWidth="50" />
      <path d={`M${x - 32} 100h64m-64 600h64`} stroke="var(--ink-2)" strokeWidth="9" /></g>)}
    {[360, 970].map(x => <g key={x}><path d={`M${x} 710V390a135 160 0 0 1 270 0v320Z`} fill="var(--ink-2)" stroke="var(--muted)" strokeWidth="15" />
      <path d={`M${x + 24} 710V390a111 130 0 0 1 222 0v320Z`} fill="var(--press)" />
      <circle cx={x + 135} cy="460" r="35" fill="none" stroke="var(--or)" strokeWidth="5" /></g>)}
    <path d="m0 900 520-190h560l520 190" fill="var(--hair)" />
    <path d="M700 190h200l-20 70-50 30v40h-60v-40l-50-30Z" fill="var(--paper)" stroke="var(--ink)" strokeWidth="5" />
    <path d="m742 220 28 10m60 0 28-10" stroke="var(--ink)" strokeWidth="12" />
  </svg>;
}

function MapPanel() {
  return <svg viewBox="0 0 185 110" aria-hidden="true">{illustrativeTiles.map(tile =>
    <path key={tile.id} d={`M${tile.x} ${tile.y}l8-4 8 4v9l-8 4-8-4Z`}
      fill={['var(--paper-2)', 'var(--azure)', 'var(--gules)', 'var(--or)'][tile.side]}
      stroke="var(--ink)" strokeWidth="1" />)}</svg>;
}

function Layer({ chamber, title, proposal, children, on_select }: {
  chamber: ModuleId; title: string; proposal?: Proposal; children: ReactNode; on_select?: (id: ModuleId) => void;
}) {
  const content = <><b>{title}</b>{children}{proposal && <span className="overview-layer-fields">
    {proposal.fields.slice(0, 2).map(field => <span key={field.key}>{field.label}: {field.struck.map((old, index) =>
      <s key={index}>{String(old)} </s>)}<strong>{String(field.value)}</strong></span>)}
  </span>}</>;
  return <div className="overview-layer" data-layer={chamber}>
    {on_select ? <button className="overview-layer-select" type="button" aria-label={`Select ${title}`} onClick={() => on_select(chamber)}>
      {proposal && isPending(proposal) ? <DraftFrame>{content}</DraftFrame> : content}
    </button> : content}
  </div>;
}

export function StreamScene({ mode, proposals, sample, on_select }: {
  mode: 'preview' | 'program'; proposals: readonly Proposal[]; sample: boolean; on_select?: (id: ModuleId) => void;
}) {
  const preview = mode === 'preview';
  const draft = (chamber: ModuleId) => proposals.filter(item => item.chamber === chamber && item.state !== 'torn').at(-1);
  const draw = draft('lottery'); const chat = draft('moderator'); const beacon = draft('visuals'); const map = draft('studio');
  const selection = on_select ? { on_select } : {};
  return <div className="overview-scene" data-scene={mode}>
    <CryptBackdrop />
    <span className="overview-scene-label">{sample ? illustrativeSceneLabel : 'Illustrative preview · live chamber data unavailable'}</span>
    {(preview || draw) && <Layer chamber="lottery" title={draw?.title ?? 'Urn and writ'} {...(draw ? { proposal: draw } : {})} {...selection}>
      <ChamberArt chamber="lottery" />{!draw && <span>No draw on screen</span>}
    </Layer>}
    {(sample || chat) && <Layer chamber="moderator" title={chat?.title ?? 'Chat and Herald'} {...(chat ? { proposal: chat } : {})} {...selection}>
      {sample && <><div className="overview-chat">{sceneChat.filter(line => preview || line.verdict === 'pass').map(line =>
        <p key={line.message_id} data-held={line.verdict !== 'pass'}>{line.verdict !== 'pass' && <b>HELD · NOT ON AIR </b>}{line.message_text}</p>)}</div>
        <div className="overview-vote">{sceneConsensus.map(direction => <span key={direction.key}>{direction.label} {Math.round(direction.share * 100)}%</span>)}</div></>}
    </Layer>}
    {(sample || beacon) && <Layer chamber="visuals" title={beacon?.title ?? 'Altar, frame and border'} {...(beacon ? { proposal: beacon } : {})} {...selection}>
      <ChamberArt chamber="visuals" /><span className="overview-camera">Camera frame · sample</span>
    </Layer>}
    {(preview || map) && <Layer chamber="studio" title={map?.title ?? 'War table'} {...(map ? { proposal: map } : {})} {...selection}>
      {preview && !map ? <DraftFrame><MapPanel /><span>Illustrative layout</span></DraftFrame> : <MapPanel />}
    </Layer>}
    <span className="overview-scene-border" aria-hidden="true" />
  </div>;
}
