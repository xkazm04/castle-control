import { useState } from 'react';
import { ConsensusChart } from './consensus-chart.jsx';
import type { ConsensusResult } from './consensus-chart.jsx';
import { InkButton } from './primitives.jsx';
import { NumberedPanel } from './panels.jsx';
import { ReplaySummary } from './replay-summary.jsx';
import { ReviewRow } from './review-row.jsx';
import { RoomStatusHero } from './room-status-hero.jsx';
import { WindowedRows, rowHeight } from './windowed-rows.jsx';

const entries = Array.from({ length: 10000 }, (_, id) => ({ id: `simulated-entry-${id}`, label: `Generated entry ${id + 1}` }));
const reviews = [
  { id: 'message', quote: 'An original generated message, retained in full for review.', detail: 'Simulated pattern · awaiting review' },
  { id: 'long-message', quote: 'A long simulated quote. '.repeat(24), detail: 'Focus the quote to read and scroll the original' },
];
const at = '2026-10-26T12:00:00Z';
const directions = [
  { key: 'left', label: 'Go left', share: 0.6, change_label: '+5.0 pp / 3 min', series: [{ at: '2026-10-26T11:45:00Z', share: 0.3 }, { at, share: 0.6 }] },
  { key: 'right', label: 'Go right', share: 0.4, change_label: 'History unavailable', series: [{ at: '2026-10-26T11:45:00Z', share: 0.7 }, { at, share: 0.4 }] },
];
const results: readonly ConsensusResult[] = ['All messages', 'Text only'].map(label => ({
  label, at, window_s: 900, directions, aria_label: `${label} · generated opinion history`, summary: '15 min · 17 messages shed · simulated',
}));

/** Deferred shared component examples with generated data and no desktop or contract imports. */
export function PromotedGallery() {
  const [paused, setPaused] = useState(false);
  const [notice, setNotice] = useState('No action selected');
  return <>
    <NumberedPanel number="0.6" title="Room status hero" gloss="plain labels and values">
      <RoomStatusHero label="Simulated room status" cells={[
        { id: 'mode', label: 'Current mode', value: 'Watching', detail: 'Preview only' },
        { id: 'size', label: 'Room size', value: 'Medium', detail: '87 chatters' },
        { id: 'queue', label: 'Queue', value: '3 held', detail: 'Human review required' },
      ]} actions={<InkButton aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? 'Resume preview' : 'Pause preview'}</InkButton>}
        action_detail="Simulated controls" />
    </NumberedPanel>
    <NumberedPanel number="0.7" title="Windowed rows" gloss="10,000 generated entries">
      <WindowedRows rows={entries} label="Generated kit entries" row_key={row => row.id}>
        {row => <div className="cc-kit-entry" role="cell">{row.label}</div>}
      </WindowedRows>
    </NumberedPanel>
    <NumberedPanel number="0.8" title="Consensus chart" gloss="read-only filters and direction selection">
      <ConsensusChart results={results} title="Opinion directions" filter_label="Messages" empty_state="No consensus history available." />
      <ConsensusChart results={[]} title="Empty history" filter_label="Messages" empty_state="No consensus history available." />
    </NumberedPanel>
    <NumberedPanel number="0.9" title="Review rows" gloss="quotes and action slots">
      <WindowedRows rows={reviews} label="Generated review queue" row_key={row => row.id} row_height={rowHeight * 4}>
        {row => <ReviewRow quote={row.quote} detail={row.detail} actions={<>
          <InkButton size="small" onClick={() => setNotice('Approved · simulated')}>Approve</InkButton>
          <InkButton size="small" variant="ghost" onClick={() => setNotice('Dismissed · simulated')}>Dismiss</InkButton>
        </>} />}
      </WindowedRows>
      <p className="cc-kit-note" role="status">{notice}</p>
    </NumberedPanel>
    <NumberedPanel number="0.10" title="Replay summary" gloss="plain counts and labels">
      <ReplaySummary items={[
        { id: 'acted', value: 10, label: 'Acted' }, { id: 'passes', value: 50, label: 'Observed passes' },
        { id: 'pending', value: 0, label: 'Judge pending' }, { id: 'void', value: 0, label: 'Judge void' },
        { id: 'unavailable', value: 0, label: 'Not evaluable' }, { id: 'failed', value: 0, label: 'Engine failed' },
      ]} />
    </NumberedPanel>
  </>;
}
