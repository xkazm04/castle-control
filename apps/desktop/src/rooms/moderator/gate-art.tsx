/**
 * The portcullis miniature (ported from the fused Illuminated gatehouse page; folio .fa-* fills).
 * Down while anything waits for a human; raised when the gate is clear. Stylised illustration.
 */
const merlons = 'M54 352V40H86V64H108V40H140V64H163V40H195V64H217V40H249V64H271V40H303V64H325V40H357V64H380V40H412V64H434V40H466V352';
const bars = [190, 213, 236, 259, 282, 305, 328];

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
      <pattern id="gh-courses" width="34" height="16" patternUnits="userSpaceOnUse"><path className="fa-course" d="M0 15.5H34M17 0V8M0 8H34M0 8V16M34 8V16" /></pattern>
      <clipPath id="gh-arch"><path d="M180 332V190A110 110 0 0 1 260 84A110 110 0 0 1 340 190V332Z" /></clipPath>
    </defs>
    <path className="fa-stone" d={`${merlons}Z`} /><path d={`${merlons}Z`} fill="url(#gh-courses)" />
    <path className="fa-line" fill="none" d={merlons} /><path className="fa-line" d="M54 74H466" />
    <path className="fa-ch" d="M78 76H114V156L96 144 78 156Z" /><path className="fa-ch" d="M406 76H442V156L424 144 406 156Z" />
    <path className="fa-gilt" d="M85 92h22v3H85ZM87 95h3v32l-1.5 4-1.5-4ZM94.5 95h3v32l-1.5 4-1.5-4ZM102 95h3v32l-1.5 4-1.5-4ZM413 92h22v3h-22ZM415 95h3v32l-1.5 4-1.5-4ZM422.5 95h3v32l-1.5 4-1.5-4ZM430 95h3v32l-1.5 4-1.5-4Z" />
    <path className="fa-iron" d="M146 92h8v40h-8ZM142 108h16v6h-16ZM366 92h8v40h-8ZM362 108h16v6h-16Z" />
    <path className="fa-stone-2 fa-line" d="M164 332V190A126 126 0 0 1 260 67.6A126 126 0 0 1 356 190V332Z" />
    <path className="gh-dark" d="M180 332V190A110 110 0 0 1 260 84A110 110 0 0 1 340 190V332Z" />
    <g clipPath="url(#gh-arch)">
      <ellipse className="gh-glow" cx="260" cy="226" rx="78" ry="80" />
      {!raised && !unavailable && <g className="gh-letter">
        <path className="fa-sheet" d="M226 176h68v94h-68Z" />
        <path className="fa-sheet" d="M222 170h76a4 4 0 0 1 0 9h-76a4 4 0 0 1 0-9ZM222 266h76a4 4 0 0 1 0 9h-76a4 4 0 0 1 0-9Z" />
        <path className="gh-rule gh-rule--r" d="M234 192h30" /><path className="gh-rule" d="M234 202h52M234 212h48M234 222h52M234 232h40" />
        <circle className="gh-seal" cx="276" cy="250" r="11" />
      </g>}
      <g className="gh-port">
        <path className="fa-iron" d="M180 118h160v5H180ZM180 186h160v5H180ZM180 254h160v5H180ZM180 302h160v5H180Z" />
        <path className="fa-iron" d={bars.map(x => `M${x} 40h6v284l-3 11-3-11Z`).join('')} />
        <path className="gh-barhi" d={bars.map(x => `M${x + 1.5} 40v284`).join('')} />
      </g>
    </g>
    <path className="fa-line" fill="none" d="M180 332V190A110 110 0 0 1 260 84A110 110 0 0 1 340 190V332" />
    <path className="fa-skull" d="M260 58c-8 0-13 5-13 11.5 0 4 2 6.6 4.6 8.2V84h16.8v-6.3c2.6-1.6 4.6-4.2 4.6-8.2C273 63 268 58 260 58Z" />
    <circle className="fa-iron" cx="255" cy="69.5" r="3" /><circle className="fa-iron" cx="265" cy="69.5" r="3" />
    <path className="fa-wood" d="M126 236h12l-3 22h-6ZM382 236h12l-3 22h-6Z" />
    <path className="fa-flame" d="M132 202c5 10 10 14 10 22a10 10 0 0 1-20 0c0-8 5-12 10-22ZM388 202c5 10 10 14 10 22a10 10 0 0 1-20 0c0-8 5-12 10-22Z" />
    <path className="fa-flame-2" d="M132 216c2.6 5 5 7 5 11a5 5 0 0 1-10 0c0-4 2.4-6 5-11ZM388 216c2.6 5 5 7 5 11a5 5 0 0 1-10 0c0-4 2.4-6 5-11Z" />
    <path className="fa-water" d="M0 346H520V380H0Z" />
    <path className="fa-wave" d="M8 358q10-6 20 0t20 0 20 0M90 366q10-6 20 0t20 0M392 360q10-6 20 0t20 0 20 0M470 370q10-6 20 0t20 0M20 374q10-5 20 0t20 0" />
    <path className="fa-wood" d="M180 332H340L376 378H144Z" />
    <path className="fa-plank" d="M200 332 188 378M220 332 213 378M240 332 237 378M260 332V378M280 332 283 378M300 332 307 378M320 332 332 378M152 352H368M146 366H374" />
  </svg>;
}
