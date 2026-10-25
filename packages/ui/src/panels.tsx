import { useId } from 'react';
import type { ReactNode } from 'react';
import './panels.css';

export function PageHeader({ number, title, description, actions, breadcrumbs = [] }: {
  number: number; title: string; description: string; actions?: ReactNode;
  breadcrumbs?: readonly { label: string; href?: string }[];
}) {
  return <header className="cc-page-header">
    <nav className="cc-breadcrumb" aria-label="Breadcrumb">
      <span>Castle Control</span><span aria-hidden="true">›</span><span>Chamber {number} of 4</span>
      {breadcrumbs.map((crumb, index) => <span key={index}> › {crumb.href ? <a href={crumb.href}>{crumb.label}</a> : <b>{crumb.label}</b>}</span>)}
    </nav>
    <div className="cc-title-row"><h1 data-text={title}>{title}</h1><p>{description}</p>
      {actions && <div className="cc-page-actions">{actions}</div>}
    </div>
  </header>;
}

export function NumberedPanel({ number, title, gloss, meta, children }: {
  number: string; title: string; gloss?: string; meta?: ReactNode; children: ReactNode;
}) {
  const heading = useId();
  return <section className="cc-panel" aria-labelledby={heading}>
    <div className="cc-panel-heading"><span className="cc-panel-number">{number}</span>
      <h2 id={heading}>{title}</h2>{gloss && <span className="cc-panel-gloss">{gloss}</span>}
      {meta && <div className="cc-panel-meta">{meta}</div>}
    </div>{children}
  </section>;
}
