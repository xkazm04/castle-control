import { useEffect, useState } from 'react';
import { InkButton, VerdictChip } from '@castle-control/ui';
import type { ModerationPort, ModerationPreview } from '../../moderation-model.js';
import { moderationCopy as copy } from '../../moderation-copy.js';

export function startSimulatedChat(port: ModerationPort, on_end: () => void): () => void {
  const timer = setInterval(() => { if (!port.advanceChat()) { clearInterval(timer); on_end(); } }, 1000);
  return () => clearInterval(timer);
}

export function ChatPlayback({ port, state }: { port: ModerationPort; state: ModerationPreview }) {
  const [playing, setPlaying] = useState(false);
  useEffect(() => playing ? startSimulatedChat(port, () => setPlaying(false)) : undefined, [playing, port]);
  const finished = state.replay_count >= state.messages.length;
  const latest = state.replay_count > 420 ? state.messages[state.replay_count - 1] : undefined;
  return <div className="moderator-playback">
    <InkButton type="button" size="room" disabled={finished} aria-pressed={playing} onClick={() => setPlaying(!playing)}>
      {playing ? copy.pause_chat : copy.play_chat}</InkButton>
    <output data-chat-arrivals="true" aria-live="off">{finished ? copy.chat_finished : copy.chat_arrivals(state.replay_count - 420)}</output>
    <p className="moderator-small">{copy.playback_note}</p>
    {latest && <p className="moderator-latest-arrival" data-latest-arrival="true"><VerdictChip verdict={latest.verdict} />
      <span>{latest.message_text}</span></p>}
  </div>;
}
