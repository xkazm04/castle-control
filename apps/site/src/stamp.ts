import { stampParts } from '@castle-control/ui/stamp';
import type { StampKind } from '@castle-control/ui/stamp';
import { element } from './dom.ts';

// Vanilla DOM adapter; the shared table owns the vocabulary and stamp class.
export function makeStamp(document: Document, kind: StampKind, word?: string): HTMLElement {
  const parts = stampParts(kind, word);
  const stamp = element(document, 'span', { cls: parts.className });
  stamp.dataset['stamp'] = parts.dataset.stamp;
  stamp.setAttribute('role', 'img');
  stamp.setAttribute('aria-label', parts.ariaLabel);
  if (parts.dot !== 'none') {
    const dot = element(document, 'i', { cls: `${parts.className}-dot` });
    dot.dataset['dot'] = parts.dot;
    dot.setAttribute('aria-hidden', 'true');
    stamp.append(dot);
  }
  const text = element(document, 'span', { text: parts.word });
  text.setAttribute('aria-hidden', 'true');
  stamp.append(text);
  return stamp;
}
