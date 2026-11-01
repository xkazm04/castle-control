import { cloneElement, createElement, memo } from 'react';
import type { CSSProperties, ReactElement, SVGProps } from 'react';
import { keepArt, keepRoomsArt, paintStyle } from '@castle-control/keep-art';
import type { ArtNode, Rect } from '@castle-control/keep-art';
import './keep.css';

// SVG spellings accepted by React. Unknown attributes stay visible to the parity test.
export const svgAttributes: Readonly<Record<string, keyof SVGProps<SVGElement>>> = {
  'stroke-width': 'strokeWidth', 'clip-path': 'clipPath', 'stop-color': 'stopColor',
  'stop-opacity': 'stopOpacity', 'font-family': 'fontFamily', 'font-size': 'fontSize',
  'font-weight': 'fontWeight', 'letter-spacing': 'letterSpacing', 'text-anchor': 'textAnchor',
  'stroke-linejoin': 'strokeLinejoin', 'stroke-dasharray': 'strokeDasharray',
  patternUnits: 'patternUnits', patternTransform: 'patternTransform',
};

// Art styles contain declarations, never arbitrary CSS rules. Preserve custom properties
// and embedded colons (for example URL values); later declarations win, as in the DOM door.
export function reactStyle(style: string): CSSProperties {
  const declarations: Record<string, string> = {};
  for (const declaration of style.split(';')) {
    const colon = declaration.indexOf(':');
    if (colon < 1) continue;
    const name = declaration.slice(0, colon).trim();
    const value = declaration.slice(colon + 1).trim();
    if (!name || !value) continue;
    const property = name.startsWith('--') ? name : name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
    declarations[property] = value;
  }
  return declarations;
}

export const keepTree = keepArt(keepRoomsArt());
type ArtProps = SVGProps<SVGElement>;
const elements = new WeakMap<ArtNode, ReactElement<ArtProps>>();

function artElement(node: ArtNode): ReactElement<ArtProps> {
  const cached = elements.get(node);
  if (cached) return cached;
  const attrs: Record<string, string | CSSProperties> = {};
  for (const [name, value] of Object.entries(node.attrs)) {
    if (name !== 'style') attrs[svgAttributes[name] ?? name] = value;
  }
  const style = [node.attrs['style'], paintStyle(node.paint)].filter(Boolean).join(';');
  if (style) attrs['style'] = reactStyle(style);
  if (node.cls) attrs['className'] = node.cls.join(' ');
  if (node.room) attrs['data-room'] = node.room;
  if (node.id) attrs['id'] = node.id;
  const element = createElement(node.tag, attrs, node.text,
    ...(node.children ?? []).map((child, index) => cloneElement(artElement(child), { key: String(index) })));
  elements.set(node, element);
  return element;
}

// Prepare the shared tree and its styles once, including for the room crops in Overview.
artElement(keepTree);

export const KeepArt = memo(function KeepArt({ node = keepTree, frame, className }: {
  node?: ArtNode; frame?: Rect; className?: string;
}) {
  const element = artElement(node);
  return frame ? cloneElement(element, {
    viewBox: `${frame.x} ${frame.y} ${frame.w} ${frame.h}`, className,
    preserveAspectRatio: 'xMidYMid meet', 'aria-hidden': true,
  }) : element;
});
