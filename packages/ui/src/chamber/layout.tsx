import type { ReactNode } from 'react';
import { useId } from 'react';
import './section.css';
import './layout.css';

export type ChamberLayoutProps = {
  picture: ReactNode;
  picture_label: string;
  /** Room title and optional drawer trigger, when not supplied by the shell. */
  heading?: ReactNode;
  caption?: ReactNode;
  preview: ReactNode;
  program: ReactNode;
  preview_title?: string;
  program_title?: string;
  columns: readonly [ReactNode, ReactNode];
};

/** Fill a min-height: 0 flex/grid room between the room bar and action row.
 * Sections must fit the available height; move heavy material into Drawer.
 * Picture content fills a 16:9 surface; its accessible name belongs to the caller.
 */
export function ChamberLayout({ picture, picture_label, heading,
  caption = 'as it is on air · simulated', preview, program,
  preview_title = 'Preview · drafts only', program_title = 'Program · simulated', columns,
}: ChamberLayoutProps) {
  const id = useId();
  return <div className="cc-chamber-layout">
    <div className="cc-chamber-grid">
      <div className="cc-chamber-picture-column">
        {heading && <header className="cc-chamber-heading" data-role="room-title">{heading}</header>}
        <figure className="cc-chamber-figure">
          <div className="cc-chamber-picture" data-role="room-picture" role="group"
            aria-label={picture_label} aria-describedby={`${id}-caption`}>{picture}</div>
          <figcaption className="cc-chamber-caption" id={`${id}-caption`}>{caption}</figcaption>
        </figure>
        <div className="cc-chamber-minis">
          <section className="cc-chamber-mini" aria-labelledby={`${id}-preview`}>
            <h3 id={`${id}-preview`}>{preview_title}</h3>{preview}
          </section>
          <section className="cc-chamber-mini" aria-labelledby={`${id}-program`}>
            <h3 id={`${id}-program`}>{program_title}</h3>{program}
          </section>
        </div>
      </div>
      {columns.map((column, index) => <div key={index} className="cc-chamber-column"
        role="group" aria-label={`Room sections ${index + 1}`}>{column}</div>)}
    </div>
  </div>;
}
