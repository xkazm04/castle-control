import type { ReactNode } from 'react';
import './stage-frame.css';

type Figures = readonly [ReactNode] | readonly [ReactNode, ReactNode] | readonly [ReactNode, ReactNode, ReactNode];
type Actions = readonly [ReactNode] | readonly [ReactNode, ReactNode];
export type StageFrameProps = {
  label: string; stage: ReactNode; headline_figures: Figures;
  primary_actions: Actions; entry_points: ReactNode;
};

/** A chamber's graphical overview; callers own content, navigation and state. */
export function StageFrame({ label, stage, headline_figures, primary_actions, entry_points }: StageFrameProps) {
  return <section className="cc-stage-frame" aria-label={label}>
    <div className="cc-stage-graphic">{stage}</div>
    <div className="cc-stage-summary">
      <div className="cc-stage-figures">{headline_figures.map((figure, index) => <div key={index}>{figure}</div>)}</div>
      <div className="cc-stage-actions">{primary_actions}</div>
    </div>
    <nav className="cc-stage-entries" aria-label={label}>{entry_points}</nav>
  </section>;
}
