import { Children, cloneElement, isValidElement } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';

const roles: Readonly<Record<string, string>> = {
  'cc-chamber-strip': 'room-bar', 'cc-chamber-tile': 'room-tab',
  'cc-chamber-tile-title': 'strip-name', 'cc-chamber-state': 'strip-state',
  'cc-room-title-card': 'room-title', 'cc-slip': 'room-title-name',
  'cc-room-function': 'room-title-fn', 'cc-room-back': 'room-back',
  'cc-monitor-label': 'monitor-label', 'cc-preview-picture': 'monitor-preview',
  'cc-program-picture': 'monitor-program',
};

type RoleProps = HTMLAttributes<HTMLElement> & {
  'data-role'?: string; 'data-room'?: string; 'data-room-tile'?: string | undefined;
};

/** Adapt the kit's pure presentation trees without copying their markup or styles.
 * Keep this at the shell boundary; the shared kit is owned by another package. */
export function shellRoles(node: ReactNode, on_keep?: () => void): ReactNode {
  return Children.map(node, child => {
    if (!isValidElement<RoleProps>(child) || typeof child.type !== 'string') return child;
    const role = child.props.className?.split(' ').map(name => roles[name]).find(Boolean);
    const room = child.props['data-room-tile'];
    const keep_crumb = on_keep && child.type === 'button' && child.props.children === 'The keep';
    return cloneElement(child, { ...(role ? { 'data-role': role } : {}),
      ...(room ? { 'data-room': room, 'data-room-tile': undefined } : {}),
      ...(keep_crumb ? { onClick: on_keep } : {}) }, shellRoles(child.props.children, on_keep));
  });
}
