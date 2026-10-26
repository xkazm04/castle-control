import type { ModuleId } from './primitives.jsx';
import { chambers } from './shell.jsx';
import './breadcrumb.css';

export type BreadcrumbProps = {
  chamber: ModuleId;
  detail?: string;
  back_href: string;
  on_back?: () => void;
  on_navigate?: (chamber: ModuleId) => void;
};

export function Breadcrumb({ chamber, detail, back_href, on_back, on_navigate }: BreadcrumbProps) {
  const current = chambers.find(item => item.id === chamber) ?? chambers[0];
  return <header className="cc-room-header">
    <nav aria-label="Breadcrumb"><a href="#/keep">The keep</a><span aria-hidden="true"> › </span>
      <span aria-current={detail ? undefined : 'page'}>The {current.name}</span>
      {detail && <><span aria-hidden="true"> › </span><span aria-current="page">{detail}</span></>}
    </nav>
    <nav className="cc-room-locator" aria-label="Chamber locator">
      {chambers.map(item => <a key={item.id} href={`#/chamber/${item.id}`} aria-label={`${item.number}: ${item.name}`}
        aria-current={item.id === chamber ? 'location' : undefined}
        onClick={event => {
          if (on_navigate && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) { event.preventDefault(); on_navigate(item.id); }
        }}>{item.number}</a>)}
    </nav>
    <a href={back_href} onClick={event => {
      if (on_back && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) { event.preventDefault(); on_back(); }
    }}>Back <kbd>Esc</kbd></a>
  </header>;
}
