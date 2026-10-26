import { fixtureHouses, fixtureTiles } from './fixture.js';

export function HexTable({ selected, on_select }: { selected: string; on_select: (id: string) => void }) {
  return <section className="studio-room-war-table" aria-label="Illustrative 9 by 6 war table">
    <h2>The war table</h2><p>9 × 6 hexes · illustrative territory · no live turn</p>
    <ul className="studio-room-legend">{fixtureHouses.map(house => <li key={house}>
      {house} · {fixtureTiles.filter(tile => tile.owner === house).length}
    </li>)}<li>Unclaimed · {fixtureTiles.filter(tile => !tile.owner).length}</li></ul>
    <div className="studio-room-board" role="group" aria-label="Inspect the 54 sample tiles">
      {fixtureTiles.map(tile => <button type="button" key={tile.id} data-hex-tile={tile.id}
        data-house={tile.owner ?? 'unclaimed'} data-row-offset={tile.row % 2 === 1}
        aria-label={`Tile ${tile.id}, ${tile.owner ?? 'unclaimed'}`} aria-pressed={selected === tile.id}
        onClick={() => on_select(tile.id)}>
        <span className="studio-room-hex-face" aria-hidden="true" />
        <span className="studio-room-hex-label">{tile.id}<small>{tile.owner?.replace('House ', '') ?? 'Free'}</small></span>
      </button>)}
    </div>
    <p>Choose any hex to inspect it. Calls and ownership here are illustrative; selecting a tile changes only the inspector.</p>
  </section>;
}

export function TileInspector({ selected }: { selected: string }) {
  const tile = fixtureTiles.find(item => item.id === selected);
  return <section className="studio-room-inspector" aria-label="Selected tile" aria-live="polite">
    <h3>Tile {tile?.id ?? 'unknown'}</h3>
    <p>{tile?.owner ?? 'Unclaimed'} · illustrative sample territory</p>
    <p>The Steward can propose a war-table panel change. A proposal never claims a tile here.</p>
  </section>;
}
