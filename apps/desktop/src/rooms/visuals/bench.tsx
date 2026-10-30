import type { ReactNode } from 'react';
import { Plate, PlateBand, SectionHeading } from '@castle-control/ui';
import { beaconsCopy as copy } from '../../beacons-copy.js';
import './bench.css';

export function BeaconBench({ name, notice, children }: { name: string; notice: ReactNode; children: ReactNode }) {
  return <Plate variant="plain" className="visuals-bench" style={{ background: 'var(--paper)' }}
    band={<PlateBand variant="bench" title={name} count={<span role="status" aria-live="polite">{notice}</span>}
      style={{ '--cc-bench-prefix': JSON.stringify(`${copy.tuning} `) }} />}>
    <div className="visuals-bench-grid">{children}</div>
  </Plate>;
}

export function BeaconBay({ title, gloss, children }: { title: string; gloss: string; children: ReactNode }) {
  return <section className="visuals-bay" aria-label={title}>
    <SectionHeading title={title} gloss={gloss} style={{ '--cc-heading-leading': 1.2 }} />{children}
  </section>;
}

/** Only the prototype's outer frame: slot padding belongs to the unchanged shell node. */
export function SealPanel({ children }: { children?: ReactNode }) {
  return <div className="visuals-seal-panel" aria-label={copy.seal}>{children}</div>;
}
