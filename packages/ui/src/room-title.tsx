import type { ReactNode } from 'react';
import type { ModuleId } from './primitives.jsx';
import { Kbd } from './kbd.jsx';
import { chambers } from './shell.jsx';
import './entrance.css';
import './breadcrumb.css';

export type RoomTitleProps = {
  chamber: ModuleId; detail?: string; stamp?: ReactNode;
  back_label: string; on_back: () => void;
};

/** Room identity and an owner-controlled return to its navigation origin. */
export function RoomTitle({ chamber, detail, stamp, back_label, on_back }: RoomTitleProps) {
  const current = chambers.find(item => item.id === chamber) ?? chambers[0];
  return <header className="cc-room-title" data-module={chamber}>
    <div className="cc-room-title-card">
      <nav className="cc-room-crumb" aria-label="Breadcrumb">
        <button type="button" onClick={on_back}>The keep</button><span aria-hidden="true">›</span>
        <b aria-current={detail ? undefined : 'page'}>{current.name}</b>
        <span>· chamber {current.number} of 4</span>
        {detail && <><span aria-hidden="true">›</span><span aria-current="page">{detail}</span></>}
      </nav>
      <h1 className="cc-slip">The {current.name}</h1>
      <div className="cc-room-function"><span>{current.description}</span>{stamp}</div>
    </div>
    <button className="cc-room-back" type="button" onClick={on_back}>{back_label}<Kbd>Esc</Kbd></button>
  </header>;
}
