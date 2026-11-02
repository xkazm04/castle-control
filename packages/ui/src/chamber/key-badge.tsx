import { Kbd } from '../kbd.jsx';
import './key-badge.css';

export type KeyBadgeProps = { letter: string };

/** Put inside a positioned control; the visible key is also its accessible text. */
export function KeyBadge({ letter }: KeyBadgeProps) {
  return <Kbd className="cc-key-badge">{letter}</Kbd>;
}
