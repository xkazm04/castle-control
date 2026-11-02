/**
 * The portcullis miniature (ported from the fused Illuminated gatehouse page; folio .fa-* fills),
 * painted with light: shaded ashlar, a deep arch reveal, forged bars, torchlight and a lit hall.
 * Down while anything waits for a human; raised when the gate is clear. Stylised illustration.
 */
const merlons = 'M54 352V40H86V64H108V40H140V64H163V40H195V64H217V40H249V64H271V40H303V64H325V40H357V64H380V40H412V64H434V40H466V352';
const merlonTops = 'M56 42H84M110 42H138M165 42H193M219 42H247M273 42H301M327 42H355M382 42H410M436 42H464';
const opening = 'M180 332V190A110 110 0 0 1 260 84A110 110 0 0 1 340 190V332Z';
const bars = [190, 213, 236, 259, 282, 305, 328];
const rails = [118, 186, 254, 302];
const point = (cx: number, r: number, degrees: number) => {
  const angle = degrees * Math.PI / 180;
  return [cx + r * Math.cos(angle), 190 + r * Math.sin(angle)] as const;
};
// Voussoir joints on both arcs of the pointed arch, inner radius 110 to the surround's 126.
const joints = [192.5, 205, 217.5, 230, 242.5].flatMap(degrees => {
  const [x1, y1] = point(290, 110, degrees); const [x2, y2] = point(290, 126, degrees);
  return [`M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`,
    `M${(520 - x1).toFixed(1)} ${y1.toFixed(1)}L${(520 - x2).toFixed(1)} ${y2.toFixed(1)}`];
}).join('');
const banner = (x: number) => `M${x} 76H${x + 36}V156L${x + 18} 144 ${x} 156Z`;
const flame = (x: number) => `M${x} 202c5 10 10 14 10 22a10 10 0 0 1-20 0c0-8 5-12 10-22Z`;
const flameCore = (x: number) => `M${x} 216c2.6 5 5 7 5 11a5 5 0 0 1-10 0c0-4 2.4-6 5-11Z`;

export function GateArt({ waiting, simulated, unavailable = false }: { waiting: number; simulated: boolean; unavailable?: boolean }) {
  const raised = waiting === 0 && !unavailable;
  const label = unavailable ? 'The gatehouse with the portcullis down: the held-message queue is unavailable in this connection. Stylised illustration.'
    : raised ? 'The gatehouse with the portcullis raised: nothing waits for you. Stylised illustration.'
    : `The gatehouse with the portcullis down: ${waiting} ${waiting === 1 ? 'message waits' : 'messages wait'} behind the bars for your review${simulated ? ' (simulated)' : ''}. Stylised illustration.`;
  return <svg className="gh-gate-art cc-folio-art" viewBox="0 0 520 380" preserveAspectRatio="xMidYMid meet" role="img" aria-label={label}
    data-raised={raised}>
    <defs>
      <linearGradient id="gh-dark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" className="gh-stop-shade" /><stop offset=".55" className="gh-stop-deep" /><stop offset="1" className="gh-stop-sky" /></linearGradient>
      <radialGradient id="gh-glow" cx="50%" cy="50%" r="50%"><stop offset="0" className="gh-stop-room1" /><stop offset=".35" className="gh-stop-room2" /><stop offset=".7" className="gh-stop-flame" /><stop offset="1" className="gh-stop-none" /></radialGradient>
      <linearGradient id="gh-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" className="gh-s-stone" /><stop offset="1" className="gh-s-stone2" /></linearGradient>
      <linearGradient id="gh-wall-side" x1="0" y1="0" x2="1" y2="0"><stop offset="0" className="gh-s-ink gh-o-30" /><stop offset=".22" className="gh-s-ink gh-o-0" />
        <stop offset=".78" className="gh-s-ink gh-o-0" /><stop offset="1" className="gh-s-ink gh-o-35" /></linearGradient>
      <linearGradient id="gh-wall-foot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" className="gh-s-ink gh-o-0" /><stop offset="1" className="gh-s-ink gh-o-40" /></linearGradient>
      <radialGradient id="gh-warm" cx="260" cy="236" r="230" gradientUnits="userSpaceOnUse"><stop offset="0" className="gh-s-flame gh-o-25" /><stop offset="1" className="gh-s-flame gh-o-0" /></radialGradient>
      <radialGradient id="gh-torch" cx="50%" cy="50%" r="50%"><stop offset="0" className="gh-s-room gh-o-80" /><stop offset=".4" className="gh-s-flame gh-o-35" /><stop offset="1" className="gh-s-flame gh-o-0" /></radialGradient>
      <linearGradient id="gh-iron-v" x1="0" y1="0" x2="1" y2="0"><stop offset="0" className="gh-s-shade" /><stop offset=".4" className="gh-s-ironhi" /><stop offset="1" className="gh-s-shade" /></linearGradient>
      <linearGradient id="gh-iron-h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" className="gh-s-ironhi" /><stop offset="1" className="gh-s-shade" /></linearGradient>
      <linearGradient id="gh-cloth" x1="0" y1="0" x2="1" y2="0"><stop offset="0" className="gh-s-ink gh-o-25" /><stop offset=".35" className="gh-s-room gh-o-25" />
        <stop offset=".6" className="gh-s-ink gh-o-0" /><stop offset="1" className="gh-s-ink gh-o-35" /></linearGradient>
      <linearGradient id="gh-water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" className="gh-s-water2" /><stop offset="1" className="gh-s-water" /></linearGradient>
      <linearGradient id="gh-wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" className="gh-s-flame gh-o-35" /><stop offset=".5" className="gh-s-flame gh-o-0" /></linearGradient>
      <pattern id="gh-courses" width="34" height="16" patternUnits="userSpaceOnUse"><path className="fa-course" d="M0 15.5H34M17 0V8M0 8H34M0 8V16M34 8V16" /></pattern>
      <clipPath id="gh-arch"><path d={opening} /></clipPath>
      <clipPath id="gh-wallclip"><path d={`${merlons}Z`} /></clipPath>
    </defs>
    {/* the wall: ashlar courses, shaded toward its corners and its foot, warmed by the hall's light */}
    <path className="fa-stone gh-wall" d={`${merlons}Z`} /><path d={`${merlons}Z`} fill="url(#gh-courses)" />
    <g clipPath="url(#gh-wallclip)">
      <path className="gh-fill-warm" d="M54 40H466V352H54Z" />
      <path className="gh-fill-side" d="M54 40H466V352H54Z" />
      <path className="gh-fill-foot" d="M54 300H466V352H54Z" />
    </g>
    <path className="gh-lit-edge" d={merlonTops} />
    <path className="fa-line" fill="none" d={merlons} /><path className="fa-line" d="M54 74H466" />
    {/* banners: cloth with a fold of light and shadow */}
    <path className="fa-ch" d={banner(78)} /><path className="fa-ch" d={banner(406)} />
    <path className="gh-fill-cloth" d={banner(78)} /><path className="gh-fill-cloth" d={banner(406)} />
    <path className="fa-gilt" d="M85 92h22v3H85ZM87 95h3v32l-1.5 4-1.5-4ZM94.5 95h3v32l-1.5 4-1.5-4ZM102 95h3v32l-1.5 4-1.5-4ZM413 92h22v3h-22ZM415 95h3v32l-1.5 4-1.5-4ZM422.5 95h3v32l-1.5 4-1.5-4ZM430 95h3v32l-1.5 4-1.5-4Z" />
    {/* arrow loops, lit from inside */}
    <path className="fa-iron" d="M146 92h8v40h-8ZM142 108h16v6h-16ZM366 92h8v40h-8ZM362 108h16v6h-16Z" />
    <path className="gh-loop-lit" d="M150 95v34M370 95v34" />
    {/* the arch: a deep reveal with voussoirs, the hall glowing behind the bars */}
    <path className="fa-stone-2 fa-line gh-surround" d="M164 332V190A126 126 0 0 1 260 67.6A126 126 0 0 1 356 190V332Z" />
    <path className="gh-joint" d={joints} />
    <path className="gh-reveal" d="M180 332V190A110 110 0 0 1 260 84A110 110 0 0 1 340 190V332" />
    <path className="gh-dark" d={opening} />
    <g clipPath="url(#gh-arch)">
      <ellipse className="gh-glow" cx="260" cy="226" rx="86" ry="88" />
      <ellipse className="gh-floor" cx="260" cy="332" rx="74" ry="16" />
      {!raised && !unavailable && <g className="gh-letter">
        <path className="fa-sheet" d="M226 176h68v94h-68Z" />
        <path className="fa-sheet" d="M222 170h76a4 4 0 0 1 0 9h-76a4 4 0 0 1 0-9ZM222 266h76a4 4 0 0 1 0 9h-76a4 4 0 0 1 0-9Z" />
        <path className="gh-rule gh-rule--r" d="M234 192h30" /><path className="gh-rule" d="M234 202h52M234 212h48M234 222h52M234 232h40" />
        <circle className="gh-seal" cx="276" cy="250" r="11" />
      </g>}
      <g className="gh-port">
        <g className="gh-port-shadow" transform="translate(5 4)">
          {rails.map(y => <path key={y} d={`M180 ${y}h160v5H180Z`} />)}
          {bars.map(x => <path key={x} d={`M${x} 40h6v284l-3 11-3-11Z`} />)}
        </g>
        {bars.map(x => <path key={x} className="gh-bar" d={`M${x} 40h6v284l-3 11-3-11Z`} />)}
        {rails.map(y => <path key={y} className="gh-rail" d={`M180 ${y}h160v5H180Z`} />)}
        <path className="gh-barhi" d={bars.map(x => `M${x + 1.5} 40v284`).join('')} />
        <g className="gh-rivet">{rails.flatMap(y => bars.map(x => <circle key={`${x}-${y}`} cx={x + 3} cy={y + 2.5} r="2.2" />))}</g>
      </g>
    </g>
    <path className="fa-line" fill="none" d="M180 332V190A110 110 0 0 1 260 84A110 110 0 0 1 340 190V332" />
    <path className="fa-skull" d="M260 58c-8 0-13 5-13 11.5 0 4 2 6.6 4.6 8.2V84h16.8v-6.3c2.6-1.6 4.6-4.2 4.6-8.2C273 63 268 58 260 58Z" />
    <circle className="fa-iron" cx="255" cy="69.5" r="3" /><circle className="fa-iron" cx="265" cy="69.5" r="3" />
    {/* torches: iron sconces, a pool of light on the stone, a flickering flame */}
    <circle className="gh-torchglow" cx="132" cy="220" r="46" /><circle className="gh-torchglow" cx="388" cy="220" r="46" />
    <path className="fa-iron" d="M122 258h20l-4 6h-12ZM378 258h20l-4 6h-12ZM130 264h4v14h-4ZM386 264h4v14h-4Z" />
    <path className="fa-wood" d="M126 236h12l-3 22h-6ZM382 236h12l-3 22h-6Z" />
    <g className="gh-flame">
      <path className="fa-flame" d={`${flame(132)}${flame(388)}`} />
      <path className="fa-flame-2" d={`${flameCore(132)}${flameCore(388)}`} />
    </g>
    {/* the moat, lit by the gate */}
    <path className="gh-water" d="M0 346H520V380H0Z" />
    <path className="gh-shimmer" d="M196 356h36M288 356h36M208 366h24M290 366h22M222 374h14M286 374h12" />
    <path className="fa-wave" d="M8 358q10-6 20 0t20 0 20 0M90 366q10-6 20 0t20 0M392 360q10-6 20 0t20 0 20 0M470 370q10-6 20 0t20 0M20 374q10-5 20 0t20 0" />
    {/* the drawbridge and its chains */}
    <path className="gh-chain" d="M172 246 148 376M348 246 372 376" />
    <path className="fa-wood" d="M180 332H340L376 378H144Z" />
    <path className="gh-fill-wood" d="M180 332H340L376 378H144Z" />
    <path className="fa-plank" d="M200 332 188 378M220 332 213 378M240 332 237 378M260 332V378M280 332 283 378M300 332 307 378M320 332 332 378M152 352H368M146 366H374" />
  </svg>;
}
