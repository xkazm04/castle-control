import type { ReactNode } from 'react';
import './surface-head.css';

/**
 * The fused chamber head for the Keep's side surfaces (overview, On stream, Set up OBS,
 * Dress rehearsal): crumbs, a blackletter title (with a versal on folio pages), an italic
 * subtitle with its SIMULATED pane, then the surface's own actions and Back to the keep.
 */
export function SurfaceHead({ className = '', trail = [], title, versal = false, subtitle, mark, actions, on_back, title_id }: {
  className?: string; trail?: readonly { label: string; href: string }[]; title: string; versal?: boolean;
  subtitle?: ReactNode; mark?: ReactNode; actions?: ReactNode; on_back: () => void; title_id?: string;
}) {
  const [first = '', ...rest] = title;
  return <header className={`cc-chamber-head surface-head ${className}`.trim()}>
    <div className="surface-head__text">
      <nav className="cc-crumbs" aria-label="Breadcrumb">
        <a href="#/keep">The keep</a>
        {trail.map(item => <span key={item.href} className="surface-head__crumb"><span className="cc-crumbs__sep" aria-hidden="true">›</span>
          <a href={item.href}>{item.label}</a></span>)}
        <span className="cc-crumbs__sep" aria-hidden="true">›</span><b aria-current="page">{title}</b>
      </nav>
      <h1 className={`cc-title${versal ? ' cc-title--incipit' : ''}`} {...(title_id ? { id: title_id } : {})}>
        {versal ? <><span className="cc-versal" aria-hidden="true"><span>{first}</span></span><span className="cc-sr">{first}</span>{rest.join('')}</> : title}
      </h1>
      {(subtitle || mark) && <p className="cc-subtitle">{subtitle}{mark}</p>}
    </div>
    <div className="cc-back">{actions}
      <button className="cc-btn" type="button" onClick={on_back}>Back to the keep <kbd className="cc-kbd">Esc</kbd></button></div>
  </header>;
}
