import { DraftFrame } from '@castle-control/ui';
import type { ModuleId } from '@castle-control/ui';
import { isPending } from '@castle-control/ui/steward';
import type { Proposal } from '@castle-control/ui/steward';
import type { ReactNode } from 'react';
import { lazy, Suspense, useId } from 'react';
import type { ArtifactId } from '@castle-control/ui/design';
import { isDesignProposal } from './design-proposal.js';
import { illustrativeBackdropLabel, illustrativeSceneLabel, sceneChat, sceneConsensus } from './fixture.js';
import { DuelTile } from './duel-tile.jsx';
import './scene.css';

const DesignArtwork = lazy(() => import('./design.jsx').then(module => ({ default: module.DesignArtwork })));
const DesignPresence = lazy(() => import('./design.jsx').then(module => ({ default: module.DesignPresence })));

function Present({ artifact, mode, visible, children }: { artifact: ArtifactId; mode: 'preview' | 'program'; visible: boolean; children: ReactNode }) {
  return visible ? children : <Suspense fallback={null}><DesignPresence artifact={artifact} mode={mode}>{children}</DesignPresence></Suspense>;
}

function Look({ artifact, mode, children }: { artifact: ArtifactId; mode: 'preview' | 'program'; children: ReactNode }) {
  return <Suspense fallback={children}><DesignArtwork artifact={artifact} mode={mode}>{children}</DesignArtwork></Suspense>;
}

/** Malakor's crypt: a vaulted stone crypt lit by two torches and a shaft from the rose window
 * (moonlight by night, daylight by day), a gargoyle shield on the keystone and the tomb under the light.
 * Every colour is a theme token read through scene.css; ids are per instance so two scenes can share a page. */
export function CryptBackdrop() {
  const uid = useId().replace(/[^\w-]/g, '');
  const id = (name: string) => `crypt-${uid}-${name}`;
  const url = (name: string) => `url(#${id(name)})`;
  const fan = [-3, -2, -1, 0, 1, 2, 3].map(step => 800 + step * 110);
  return <svg className="overview-crypt" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={id('wall')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" className="crypt-s-wall-top" /><stop offset=".55" className="crypt-s-wall" /><stop offset="1" className="crypt-s-wall-low" /></linearGradient>
      <pattern id={id('masonry')} width="160" height="72" patternUnits="userSpaceOnUse">
        <path className="crypt-mortar" d="M0 1h160M0 37h160M80 1v36M0 37v36M160 37v36" /></pattern>
      <linearGradient id={id('floor')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" className="crypt-s-floor-far" /><stop offset="1" className="crypt-s-floor-near" /></linearGradient>
      <linearGradient id={id('column')} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" className="crypt-s-col-dark" /><stop offset=".45" className="crypt-s-col-lit" /><stop offset="1" className="crypt-s-col-dark" /></linearGradient>
      <linearGradient id={id('void')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" className="crypt-s-void" /><stop offset="1" className="crypt-s-void-low" /></linearGradient>
      <linearGradient id={id('shield')} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" className="crypt-s-carve-lit" /><stop offset="1" className="crypt-s-carve-dark" /></linearGradient>
      <radialGradient id={id('torch')}>
        <stop offset="0" className="crypt-s-glow" /><stop offset="1" className="crypt-s-glow-out" /></radialGradient>
      <radialGradient id={id('rose')}>
        <stop offset="0" className="crypt-s-light" /><stop offset=".7" className="crypt-s-light-mid" /><stop offset="1" className="crypt-s-light-out" /></radialGradient>
      <linearGradient id={id('shaft')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" className="crypt-s-light" /><stop offset="1" className="crypt-s-light-out" /></linearGradient>
      <radialGradient id={id('vignette')} cx=".5" cy=".46" r=".72">
        <stop offset=".5" className="crypt-s-vig-in" /><stop offset="1" className="crypt-s-vig" /></radialGradient>
    </defs>
    <rect width="1600" height="900" fill={url('wall')} />
    <rect width="1600" height="700" fill={url('masonry')} />
    {/* the vault: shaded spandrels outside two ribbed pointed arches */}
    <path className="crypt-shade" d="M0 0h1600v700h-60V120Q800-300 60 120v580H0Z" />
    <path className="crypt-rib" d="M60 700V120Q800-300 1540 120v580" />
    <path className="crypt-rib crypt-rib--thin" d="M470 690V150Q800-30 1130 150v540" />
    {/* the rose window behind the keystone, and the shaft of light it throws on the tomb */}
    <circle cx="800" cy="250" r="150" fill={url('rose')} className="crypt-rose-halo" />
    <g className="crypt-tracery"><circle cx="800" cy="250" r="118" />
      {[0, 45, 90, 135].map(angle => <path key={angle} d="M800 132v236" transform={`rotate(${angle} 800 250)`} />)}
      <circle cx="800" cy="250" r="56" /></g>
    <path className="crypt-shaft" d="M712 300h176l170 470H542Z" fill={url('shaft')} />
    {/* side doorways into the dark aisles */}
    {[300, 1300].map(x => {
      const lit = x < 800 ? 1 : -1;
      return <g key={x}>
        <path className="crypt-voussoir" d={`M${x - 128} 690V468Q${x - 128} 352 ${x} 318Q${x + 128} 352 ${x + 128} 468V690Z`} />
        <path d={`M${x - 104} 690V472Q${x - 104} 372 ${x} 344Q${x + 104} 372 ${x + 104} 472V690Z`} fill={url('void')} />
        <path className="crypt-jamb" d={`M${x + lit * 104} 690V472Q${x + lit * 104} 400 ${x + lit * 62} 364V690Z`} />
        <path className="crypt-step" d={`M${x - 120} 690h240l14 16H${x - 134}Z`} /></g>;
    })}
    {/* the floor: flagstones running to the vanishing point under the window */}
    <path d="M0 900 470 690h660l470 210Z" fill={url('floor')} />
    <g className="crypt-flags">
      {fan.map(x => <path key={x} d={`M${x} 690L${800 + (x - 800) * 2.24} 900`} />)}
      {[712, 748, 806].map(y => { const half = 330 + (y - 690) * (470 / 210); return <path key={y} d={`M${800 - half} ${y}H${800 + half}`} />; })}
    </g>
    {/* columns: two at the stage edge, two silhouetted in the foreground */}
    {[470, 1130].map(x => <g key={x}><rect x={x - 26} y="150" width="52" height="540" fill={url('column')} />
      <path className="crypt-capital" d={`M${x - 40} 150h80l-12 26h-56Z`} /><path className="crypt-capital" d={`M${x - 38} 690h76v-18h-76Z`} /></g>)}
    {[60, 1540].map(x => <g key={x}><rect x={x - 64} y="0" width="128" height="900" className="crypt-near" />
      <path className="crypt-near-edge" d={`M${x + (x < 800 ? 64 : -64)} 0V900`} /></g>)}
    {/* the tomb under the light */}
    <path className="crypt-stone-dark" d="M604 772l26-62h340l26 62Z" />
    <path className="crypt-stone" d="M650 710v-86q0-16 16-16h268q16 0 16 16v86Z" />
    <path className="crypt-stone-lit" d="M656 608l30-30h228l30 30Z" />
    <path className="crypt-carve" d="M672 600h256" />
    {/* a blind arcade on the tomb chest: three pointed panels, a carved quatrefoil in each */}
    {[700, 800, 900].map(x => <g key={x}>
      <path className="crypt-panel" d={`M${x - 34} 702V652Q${x - 34} 630 ${x} 620Q${x + 34} 630 ${x + 34} 652V702Z`} />
      <g className="crypt-carve crypt-quatrefoil">{[[-8, 0], [8, 0], [0, -8], [0, 8]].map(([dx = 0, dy = 0]) =>
        <circle key={`${dx},${dy}`} cx={x + dx} cy={664 + dy} r="8" />)}</g></g>)}
    {/* torches flanking the tomb */}
    {[586, 1014].map(x => <g key={x}>
      <circle cx={x} cy="440" r="300" fill={url('torch')} className="crypt-torch-wash" />
      <circle cx={x} cy="420" r="170" fill={url('torch')} className="crypt-torch-glow" />
      <path className="crypt-iron" d={`M${x - 16} 470h32l-6 22h-20Z M${x} 492v26`} />
      <path className="crypt-wood" d={`M${x - 9} 470l-5-40h28l-5 40Z`} />
      <path className="crypt-flame" d={`M${x} 362c22 22 26 40 14 62-6 10-22 12-28 2-10-18-6-38 14-64Z`} />
      <path className="crypt-flame-core" d={`M${x} 396c9 11 10 20 4 29-3 4-10 4-12 0-4-9-2-18 8-29Z`} /></g>)}
    {/* the keystone: a gargoyle on a heater shield, wings spread under the rose */}
    <g className="crypt-gargoyle">
      <path className="crypt-wing" d="M712 214c-40-30-96-30-140-6 30 2 44 14 50 30-22-6-44 0-60 14 26 2 40 12 46 28-14 0-28 6-36 18 50-8 96-20 140-44Z" />
      <path className="crypt-wing" d="M888 214c40-30 96-30 140-6-30 2-44 14-50 30 22-6 44 0 60 14-26 2-40 12-46 28 14 0 28 6 36 18-50-8-96-20-140-44Z" />
      <path className="crypt-horn" d="M752 186c-26-22-30-50-14-72 2 26 14 42 34 54Z" />
      <path className="crypt-horn" d="M848 186c26-22 30-50 14-72-2 26-14 42-34 54Z" />
      <path d="M716 176h168v82q0 70-84 104-84-34-84-104Z" fill={url('shield')} className="crypt-shield" />
      <path className="crypt-shield-rim" d="M730 190h140v68q0 58-70 88-70-30-70-88Z" />
      <path className="crypt-brow" d="M744 236q26-22 56-6 30-16 56 6-28 2-56 18-28-16-56-18Z" />
      <ellipse className="crypt-eye" cx="772" cy="252" rx="11" ry="6" /><ellipse className="crypt-eye" cx="828" cy="252" rx="11" ry="6" />
      <path className="crypt-snout" d="M786 266q14-8 28 0l-4 18h-20Z" />
      <path className="crypt-maw" d="M758 300q42 26 84 0-8 22-42 30-34-8-42-30Z" />
      <path className="crypt-fang" d="M772 304l6 14 6-12M816 306l6 12 6-14" />
    </g>
    <rect width="1600" height="900" fill={url('vignette')} />
  </svg>;
}

/** The same painted heraldic plates the Keep windows show for these rooms (static files under /art). */
const roomArt = { lottery: '/art/preset-heraldic-urn.webp', visuals: '/art/preset-heraldic-altar.webp' } as const;
function RoomArt({ room }: { room: keyof typeof roomArt }) {
  return <span className="overview-room-art" data-room={room}><img src={roomArt[room]} alt="" decoding="async" /></span>;
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

export function StreamScene({ mode, proposals, sample, simulated = sample, on_select }: {
  mode: 'preview' | 'program'; proposals: readonly Proposal[]; sample: boolean; on_select?: (id: ModuleId) => void;
  /** The session is simulated (fixture or a core dress rehearsal): live reads on the picture carry the label. */
  simulated?: boolean;
}) {
  const preview = mode === 'preview';
  const draft = (chamber: ModuleId) => proposals.filter(item => item.chamber === chamber && item.state !== 'torn' && !isDesignProposal(item)).at(-1);
  const draw = draft('lottery'); const chat = draft('moderator'); const beacon = draft('visuals'); const map = draft('studio');
  const selection = on_select ? { on_select } : {};
  return <div className="overview-scene" data-scene={mode}>
    <CryptBackdrop />
    <span className="overview-scene-label">{sample ? illustrativeSceneLabel : illustrativeBackdropLabel}</span>
    <Present artifact="draw" mode={mode} visible={preview || Boolean(draw)}><Layer chamber="lottery" title={draw?.title ?? 'Urn and writ'} {...(draw ? { proposal: draw } : {})} {...selection}>
      <Look artifact="draw" mode={mode}><RoomArt room="lottery" /></Look>{!draw && <span>No draw on screen</span>}
    </Layer></Present>
    <Present artifact="overlay" mode={mode} visible={preview || sample || Boolean(chat)}><Layer chamber="moderator" title={chat?.title ?? 'Chat and Herald'} {...(chat ? { proposal: chat } : {})} {...selection}>
      <Look artifact="overlay" mode={mode}>{sample && <div className="overview-chat">{sceneChat.filter(line => preview || line.verdict === 'pass').map(line =>
        <p key={line.message_id} data-held={line.verdict !== 'pass'}>{line.verdict !== 'pass' && <b>HELD · NOT ON AIR </b>}{line.message_text}</p>)}</div>
      }</Look>
      {!sample && !chat && <span>No chat lines on screen</span>}
      {sample && <div className="overview-vote">{sceneConsensus.map(direction => <span key={direction.key}>{direction.label} {Math.round(direction.share * 100)}%</span>)}</div>}
    </Layer></Present>
    <Present artifact="beacon" mode={mode} visible={preview || sample || Boolean(beacon)}><Layer chamber="visuals" title={beacon?.title ?? 'Altar, frame and border'} {...(beacon ? { proposal: beacon } : {})} {...selection}>
      <Look artifact="beacon" mode={mode}><RoomArt room="visuals" />{sample && <span className="overview-camera">Camera frame · sample</span>}</Look>{!sample && !beacon && <span>No beacon on screen</span>}
    </Layer></Present>
    <Present artifact="map" mode={mode} visible={preview || Boolean(map)}><Layer chamber="studio" title={map?.title ?? 'Chat duel'} {...(map ? { proposal: map } : {})} {...selection}>
      <Look artifact="map" mode={mode}>{preview && !map ? <DraftFrame><DuelTile sample={sample} simulated={simulated} /></DraftFrame> : <DuelTile sample={sample} simulated={simulated} />}</Look>
    </Layer></Present>
    <span className="overview-scene-border" aria-hidden="true" />
  </div>;
}
