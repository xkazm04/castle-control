import type { ReactNode } from 'react';
import './draft-frame.css';

export function DraftFrame({ children }: { children: ReactNode }) {
  return <div className="cc-draft-frame" data-draft-frame>
    <b className="cc-draft-label">DRAFT · NOT ON AIR</b>{children}
  </div>;
}
