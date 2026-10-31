import { componentProbe } from './component-probe.jsx';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { ProposalQueue } from '@castle-control/ui/steward';
import { styles, art } from '../../demo/model.js';
import { fixtureCharts, fixtureMessages } from '../../moderation-fixture.js';
import { createOutputPreview, playOutputTiming } from './output-model.js';
import { OutputFrame, OutputPreview, OutputSettings } from './output.jsx';
import { moderationSession } from './session.js';
import * as timing from './output-model.js';

vi.mock('./output-model.js', async original => ({ ...await original<typeof timing>() }));

test('one timing replay per press ignores size edits and each timing keystroke', () => {
  vi.useFakeTimers(); const play = vi.spyOn(timing, 'playOutputTiming'); const port = createOutputPreview();
  port.update('chat', 'show_ms', '100'); port.update('vote', 'show_ms', '100');
  const h = componentProbe(() => <OutputPreview port={port} messages={[]} directions={[]} />);
  h.render(); h.click('Replay output timing'); h.render();
  expect(play).toHaveBeenCalledTimes(2);
  h.change('Vote bar size', 'L'); h.render();
  for (const value of ['2', '20', '200', '2000']) { h.change('Chat overlay show after (ms)', value); h.render(); }
  expect(play).toHaveBeenCalledTimes(2);
  vi.advanceTimersByTime(100); expect(h.render().match(/data-phase="visible"/g)).toHaveLength(4);
  h.click('Replay output timing'); h.render(); expect(play).toHaveBeenCalledTimes(4);
  h.dispose(); expect(vi.getTimerCount()).toBe(0);
});

test('completed timing restores both layers in both frames and reports finished', () => {
  vi.useFakeTimers(); const port = createOutputPreview();
  const h = componentProbe(() => <OutputPreview port={port} messages={[]} directions={[]} />);
  h.render(); h.click('Replay output timing'); h.render();
  vi.advanceTimersByTime(10000); const html = h.render();
  expect(html.match(/visibility="visible"/g)).toHaveLength(4);
  expect(html).toContain('Timing replay finished');
  h.change('Vote bar size', 'L'); expect(h.render().match(/visibility="visible"/g)).toHaveLength(4);
  h.dispose(); expect(vi.getTimerCount()).toBe(0);
});

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

test('output settings clamp finite milliseconds and reject unknown presets without transport', () => {
  const network = vi.spyOn(globalThis, 'fetch'); const port = createOutputPreview();
  port.update('vote', 'show_ms', '-7'); port.update('vote', 'hide_ms', '999999');
  expect(port.getSnapshot().vote).toMatchObject({ show_ms: 0, hide_ms: 60000 });
  port.update('chat', 'show_ms', '12.7'); port.update('chat', 'hide_ms', '-1');
  expect(port.getSnapshot().chat).toMatchObject({ show_ms: 13, hide_ms: 250 });
  const before = port.getSnapshot();
  for (const value of ['', 'Infinity', 'NaN']) port.update('vote', 'show_ms', value);
  port.update('vote', 'colour', '#ff00ff'); port.update('chat', 'art_style', 'unknown');
  expect(port.getSnapshot()).toBe(before); expect(network).not.toHaveBeenCalled();
});

test('output preferences survive room re-entry per queue, with isolated sessions', () => {
  const queue = new ProposalQueue(); const session = moderationSession(queue);
  session.output.update('vote', 'size', 'L');
  expect(moderationSession(queue).output.getSnapshot().vote.size).toBe('L');
  expect(moderationSession(new ProposalQueue()).output.getSnapshot().vote.size).toBe('M');
});

test('timing waits, shows, hides and cancels without leaving a timer', () => {
  vi.useFakeTimers(); const phase = vi.fn();
  const cancel = playOutputTiming({ show_ms: 200, hide_ms: 500 }, phase);
  expect(phase).toHaveBeenLastCalledWith('waiting');
  vi.advanceTimersByTime(199); expect(phase).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(1); expect(phase).toHaveBeenLastCalledWith('visible');
  vi.advanceTimersByTime(500); expect(phase).toHaveBeenLastCalledWith('hidden');
  cancel(); expect(vi.getTimerCount()).toBe(0);
  const stop = playOutputTiming({ show_ms: 200, hide_ms: 500 }, phase); stop();
  const calls = phase.mock.calls.length; vi.runAllTimers(); expect(phase).toHaveBeenCalledTimes(calls);
});

test('each preset renders only passed chat, read-only vote art and illustrative shares on both transparent frames', () => {
  const port = createOutputPreview();
  for (const style of styles) {
    port.update('vote', 'art_style', style.id); port.update('chat', 'art_style', style.id);
    port.update('chat', 'anchor', 'top-right'); port.update('chat', 'size', 'L'); port.update('chat', 'colour', 'gules');
    for (const width of [1920, 1280] as const) {
      const html = renderToStaticMarkup(<OutputFrame width={width} settings={port.getSnapshot()} messages={fixtureMessages.slice(0, 14)}
        directions={fixtureCharts[0]?.directions ?? []} phases={{ chat: 'visible', vote: 'visible' }} />);
      expect(html).toContain(`viewBox="0 0 ${width} ${width * 9 / 16}"`);
      expect(html).toContain('data-transparent="true"'); expect(html).toContain('SIMULATED');
      expect(html).toContain(art(style.id, 'votebar')); expect(html).toContain('data-anchor="top-right"');
      expect(html).toContain('data-size="L"'); expect(html).toContain('--cc-ink:var(--gules)');
      expect(html).toContain('Go left'); expect(html).not.toContain(fixtureMessages[0]?.message_text);
      expect(html).not.toContain(fixtureMessages[7]?.message_text);
      expect(html).toContain(fixtureMessages[12]?.message_text);
    }
  }
});

test('settings use labelled kit fields and hidden output keeps its provenance', () => {
  const port = createOutputPreview(); const labels = renderToStaticMarkup(<OutputSettings layer="chat" value={port.getSnapshot().chat} port={port} />);
  expect(labels.match(/class="cc-field"/g)).toHaveLength(6);
  expect(labels).toContain('Chat overlay art style');
  const html = renderToStaticMarkup(<OutputFrame width={1920} settings={port.getSnapshot()} messages={[]}
    directions={[]} phases={{ chat: 'hidden', vote: 'waiting' }} />);
  expect(html).toContain('No passed messages'); expect(html).toContain('No consensus directions');
  expect(html).toContain('visibility="hidden"'); expect(html).toContain('SIMULATED');
});
