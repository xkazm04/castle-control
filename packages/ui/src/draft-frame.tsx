import type { ReactNode } from 'react';
import { Stamp } from './stamp/stamp.jsx';
import './draft-frame.css';

export function DraftFrame({ children }: { children: ReactNode }) {
  return <div className="cc-draft-frame" data-draft-frame>
    {children}<Stamp kind="draft" word="DRAFT · NOT ON AIR" />
  </div>;
}
