export const ladderRungs = [
  { title: 'Sand table', detail: 'Local test, only you see it. Inspect sample tiles and drafts without changing a channel.' },
  { title: 'Muster', detail: 'Locked. Hosted testing waits for Twitch’s WP 4.0 policy answer. No Extension is built or connected.' },
  { title: 'Proclaimed', detail: 'Locked. No release or submission is available. Twitch policy clearance and owner approval are required.' },
] as const;

export function TestLadder({ selected, on_select }: { selected: number; on_select: (index: number) => void }) {
  return <section className="studio-room-ladder" aria-label="Local studio test ladder">
    <h3>Test ladder</h3><p>Current stage: Sand table</p>
    <p>Inspect a stage below. These controls show requirements only.</p>
    <div role="group" aria-label="Inspect test stage requirements">
      {ladderRungs.map((rung, index) => <button type="button" key={rung.title} aria-pressed={selected === index}
        aria-label={`Inspect ${rung.title} requirements`} onClick={() => on_select(index)}>
        <b>{rung.title}</b><span>{index === 0 ? 'Local only' : 'Locked · requirements only'}</span>
      </button>)}
    </div>
    <p role="status" aria-live="polite">{ladderRungs[selected]?.detail}</p>
    <p>WP 4.0 is pending. The room makes no network call and cannot advance the test stage.</p>
  </section>;
}
