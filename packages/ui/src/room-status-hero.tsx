import type { ReactNode } from 'react';
import './room-status-hero.css';

export type RoomStatusCell = { id: string; label: ReactNode; value: ReactNode; detail?: ReactNode };
export type RoomStatusHeroProps = {
  label: string; cells: readonly RoomStatusCell[]; actions?: ReactNode; action_detail?: ReactNode;
};

export function RoomStatusHero({ label, cells, actions, action_detail }: RoomStatusHeroProps) {
  return <section className="cc-room-status" aria-label={label}>
    {cells.map(cell => <div key={cell.id}><span>{cell.label}</span><b>{cell.value}</b>
      {cell.detail !== undefined && <small>{cell.detail}</small>}
    </div>)}
    {actions !== undefined && <div>{actions}{action_detail !== undefined && <small>{action_detail}</small>}</div>}
  </section>;
}
