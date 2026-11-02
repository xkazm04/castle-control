import { Children } from 'react';
import type { ReactNode } from 'react';
import { Stamp } from './stamp/stamp.jsx';
import { EmptyState } from './primitives.jsx';
import './program-monitor.css';

export function ProgramMonitor({ children }: { children: ReactNode }) {
  return <section className="cc-program-monitor" aria-label="Program monitor">
    <header className="cc-monitor-label"><strong><i className="cc-monitor-lamp" data-on-air={Children.toArray(children).length > 0} aria-hidden="true" />Program</strong>
      <Stamp kind="simulated" word="Simulated program" /></header>
    <div className="cc-program-picture cc-monitor-picture">{Children.toArray(children).length > 0 ? children : <EmptyState compact title="Nothing sealed to Program" />}</div>
    <p className="cc-colnote">Sample picture only · nothing is sent to OBS</p>
  </section>;
}

export function PreviewMonitor({ children }: { children: ReactNode }) {
  return <section className="cc-preview-monitor" aria-label="Preview monitor">
    <header className="cc-monitor-label"><strong><i className="cc-monitor-lamp cc-preview-lamp" aria-hidden="true" />Preview</strong>
      <Stamp kind="draft" word="Drafts only" /></header>
    <div className="cc-preview-picture cc-monitor-picture">{Children.toArray(children).length > 0 ? children : <EmptyState compact title="Nothing in Preview" description="Draft a writ in a room. Nothing goes on air until your seal." />}</div>
  </section>;
}
