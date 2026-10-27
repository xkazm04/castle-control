import type { DesignOutput, SceneShape } from './catalog.js';

/** Illustrative scene fixtures, not the live renderer or draw animation. */
const silhouettes: Readonly<Record<SceneShape, string>> = {
  urn: 'M64 28 H116 L108 46 Q140 70 116 105 H64 Q40 70 72 46 Z M58 110 H122 M70 22 H110',
  wheel: 'M90 22 A44 44 0 1 0 90 110 A44 44 0 1 0 90 22 M90 22 V110 M46 66 H134 M59 35 L121 97 M121 35 L59 97',
  deck: 'M48 36 L106 20 L132 96 L74 112 Z M64 28 L122 28 L122 108',
  'ballot-box': 'M44 54 H136 V108 H44 Z M44 54 L62 36 H118 L136 54 M72 44 H108 M82 16 H104 V40 H82 Z',
  altar: 'M40 98 H140 V110 H40 Z M56 76 H124 V98 H56 Z M90 72 Q60 48 86 18 Q80 44 106 46 Q118 62 90 72 Z',
  frame: 'M26 24 H154 V110 H26 Z M36 34 H144 V100 H36 Z M26 24 L36 34 M154 110 L144 100',
  border: 'M24 48 V22 H66 M114 22 H156 V48 M156 84 V110 H114 M66 110 H24 V84',
  'hex-map': 'M58 26 L82 40 V68 L58 82 L34 68 V40 Z M106 26 L130 40 V68 L106 82 L82 68 V40 Z M82 68 L106 82 V110 L82 124 L58 110 V82 Z',
  'choice-board': 'M26 34 H62 V102 H26 Z M72 34 H108 V102 H72 Z M118 34 H154 V102 H118 Z',
  'viewer-card': 'M44 20 H136 V112 H44 Z M90 34 A16 16 0 1 0 90 66 A16 16 0 1 0 90 34 M64 88 H116 M64 100 H102',
  draw: 'M34 38 H146 V100 H34 Z M42 48 H138 M68 58 V90 M112 58 V90',
  'contribution-meter': 'M24 52 H156 V84 H24 Z M34 62 H112 V74 H34 Z',
  'chat-overlay': 'M28 24 H152 V94 H74 L50 112 V94 H28 Z M44 44 H136 M44 58 H118 M44 72 H128',
  'stream-frame': 'M22 22 H158 V110 H22 Z M34 34 H146 V98 H34 Z M108 86 H146 V98 H108 Z',
};

export function DesignScene({ output }: { output: DesignOutput }) {
  const marks = output.style.density === 'quiet' ? 3 : output.style.density === 'bold' ? 9 : 6;
  return <div className="cc-design-scene" data-ink={output.style.ink} data-treatment={output.style.treatment}
    data-density={output.style.density}>
    <svg viewBox="0 0 180 140" role="img" aria-label={`Simulated ${output.scene.shape} ${output.style.treatment} preview`}>
      <path d={silhouettes[output.scene.shape]} />
      <g className="cc-design-grain" aria-hidden="true">{Array.from({ length: marks }, (_, index) =>
        <path key={index} d={`M${38 + index * 12} 118 v6`} />)}</g>
    </svg>
    <p>{output.scene.shape.replaceAll('-', ' ')} · {output.style.treatment} · {output.style.density}</p>
  </div>;
}
