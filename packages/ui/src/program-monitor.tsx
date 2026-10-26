import type { ReactNode } from 'react';
import './program-monitor.css';

export function ProgramMonitor({ children }: { children: ReactNode }) {
  return <section className="cc-program-monitor" aria-label="Program monitor">
    <header><strong>Program</strong><span>SIMULATED PROGRAM</span></header>
    <div className="cc-program-picture">{children}</div>
    <p>Sample picture only · nothing is sent to OBS</p>
  </section>;
}
