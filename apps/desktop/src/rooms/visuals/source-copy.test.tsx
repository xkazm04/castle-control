import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import type { Visual, VisualId } from '@castle-control/contract';
import { createCoreBeaconsPort } from '../../beacons-core.js';
import type { BeaconsNetwork } from '../../beacons-core.js';
import { ConnectedBeacons } from './core.jsx';
import { BrowserSourceButton, BrowserSourceNotice, createBrowserSourceCopy } from './source-copy.jsx';
import { createFixtureSourceCopy } from './source-copy.jsx';
import { createBeaconsPreview } from '../../beacons-model.js';

const visual_id = 'simulated-frame' as VisualId;
const url = 'http://localhost:4312/beacons/simulated-frame';
const visual: Visual = { visual_id, name: 'Simulated frame', curve: {
  ranges: [{ total: 0, intensity: 0 }, { total: 50, intensity: 1 }], decay: { kind: 'none' },
} };
function harness() {
  const rpc = vi.fn<BeaconsNetwork['rpc']>(async (_endpoint, _session, method) =>
    method === 'beacons.visual.list' ? { visuals: [visual, { ...visual, visual_id: 'second-frame', name: 'Second frame' }] } : { url });
  const port = createCoreBeaconsPort({ mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) }, { rpc });
  const writeText = vi.fn<(value: string) => Promise<void>>(async () => undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  const copy = createBrowserSourceCopy(port);
  const notice = () => renderToStaticMarkup(<BrowserSourceNotice state={copy.getSnapshot()} />);
  const button = () => BrowserSourceButton({ copy, visual, busy: port.getSnapshot().busy || copy.getSnapshot().busy });
  return { port, rpc, writeText, copy, notice, button };
}
afterEach(() => { vi.unstubAllGlobals(); });

test('copy confirmation identifies the captured visual even if selection changes while copying', async () => {
  const h = harness(); await h.port.load();
  let finish: () => void = () => { throw new Error('Missing pending clipboard'); };
  h.writeText.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const copying = h.copy.copy(visual_id);
  await vi.waitFor(() => expect(h.writeText).toHaveBeenCalledOnce());
  const second = h.port.getSnapshot().visuals[1];
  if (!second) throw new Error('Missing generated second visual');
  h.port.select(second.visual_id);
  finish(); await copying;
  expect(h.notice()).toContain('Copied for Simulated frame');
  expect(h.notice()).toContain('Paste into an OBS browser source');
});

test('fixture copy labels the exact simulated example and clipboard failure never claims success', async () => {
  const port = createBeaconsPreview();
  const network = vi.spyOn(globalThis, 'fetch');
  const writeText = vi.fn<(value: string) => Promise<void>>(async () => undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  try {
    const source = createFixtureSourceCopy(port);
    await source.copy(port.getSnapshot().selected);
    expect(writeText).toHaveBeenCalledExactlyOnceWith('http://localhost:4821/fixture-not-live/offering-altar');
    expect(source.getSnapshot().notice).toContain('SIMULATED example URL copied for Offering altar');
    expect(source.getSnapshot().notice).toContain('Not a live browser source');
    writeText.mockRejectedValueOnce(new Error('denied'));
    await source.copy(port.getSnapshot().selected);
    expect(source.getSnapshot().phase).toBe('error');
    expect(source.getSnapshot().notice).not.toContain('copied');
    expect(network).not.toHaveBeenCalled();
  } finally { network.mockRestore(); }
});

test('connected room offers one native copy action per visual and an accessible status', async () => {
  const h = harness(); await h.port.load();
  const html = renderToStaticMarkup(<ConnectedBeacons port={h.port} />);
  expect(html.match(/>Copy browser-source URL<\/button>/g)).toHaveLength(2);
  expect(html).toContain('Copy browser-source URL for Simulated frame');
  expect(html).toContain('Copy browser-source URL for Second frame');
  expect(html).toContain('aria-live="polite"');
  expect(html).not.toContain(url);
  expect(html).not.toContain('\u2014');
  const control = h.button();
  expect(control.type).toBe('button'); expect(control.props.type).toBe('button');
  expect(control.props.disabled).toBe(false); expect(control.props.tabIndex).not.toBe(-1);
});

test('native button activation copies exactly the validated core URL and announces success', async () => {
  const h = harness(); const listener = vi.fn(); const stop = h.copy.subscribe(listener);
  await h.button().props.onClick();
  expect(h.writeText).toHaveBeenCalledExactlyOnceWith(url);
  expect(h.rpc).toHaveBeenCalledExactlyOnceWith(expect.any(String), expect.any(String), 'beacons.source.url', { visual_id });
  expect(h.notice()).toContain('role="status"'); expect(h.notice()).toContain('aria-atomic="true"');
  expect(h.notice()).toContain('Browser-source URL copied.');
  expect(h.copy.getSnapshot().busy).toBe(false);
  expect(h.notice()).not.toContain(url); expect(listener).toHaveBeenCalled(); stop();
});

test.each(['unavailable', 'not_found'] as const)('core %s is labelled unavailable with no URL or fixture fallback', async code => {
  const h = harness();
  h.rpc.mockRejectedValueOnce({ code, message: 'Private upstream error and URL' });
  await h.button().props.onClick();
  expect(h.notice()).toContain('Browser-source URL unavailable');
  expect(h.notice()).not.toContain('http'); expect(h.notice()).not.toContain('Private');
  expect(h.copy.getSnapshot().phase).toBe('unavailable');
  expect(h.writeText).not.toHaveBeenCalled(); expect(h.rpc).toHaveBeenCalledTimes(1);
});

test('a non-loopback core reply is never copied', async () => {
  const h = harness(); h.rpc.mockResolvedValueOnce({ url: 'http://example.com:4312/beacons/simulated-frame' });
  await h.button().props.onClick();
  expect(h.writeText).not.toHaveBeenCalled(); expect(h.notice()).toContain('unavailable');
  expect(h.notice()).not.toContain('example.com');
});

test('clipboard rejection announces failure, clears busy state and requires an explicit retry', async () => {
  const h = harness();
  h.writeText.mockRejectedValueOnce(new Error('Private clipboard error'));
  await h.button().props.onClick();
  expect(h.notice()).toContain('Copy failed. Clipboard access was denied or is unavailable.');
  expect(h.notice()).not.toContain('Private'); expect(h.copy.getSnapshot().busy).toBe(false);
  expect(h.writeText).toHaveBeenCalledTimes(1); expect(h.rpc).toHaveBeenCalledTimes(1);
  await h.button().props.onClick(); expect(h.notice()).toContain('Browser-source URL copied.');
});

test('missing clipboard access is announced as failure without an unhandled rejection', async () => {
  const h = harness(); vi.stubGlobal('navigator', {});
  await h.button().props.onClick(); expect(h.notice()).toContain('Copy failed.');
  expect(h.copy.getSnapshot().busy).toBe(false);
});

test('duplicate clicks stay blocked through clipboard completion and stale success clears on failure', async () => {
  const h = harness();
  let finish: () => void = () => { throw new Error('Expected pending clipboard'); };
  h.writeText.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  const pending = h.button().props.onClick();
  await vi.waitFor(() => expect(h.writeText).toHaveBeenCalledTimes(1));
  expect(h.button().props.disabled).toBe(true);
  await h.button().props.onClick(); expect(h.rpc).toHaveBeenCalledTimes(1);
  finish(); await pending; expect(h.notice()).toContain('Browser-source URL copied.');
  h.rpc.mockRejectedValueOnce({ code: 'unavailable', message: 'No overlay' });
  await h.button().props.onClick();
  expect(h.notice()).toContain('unavailable'); expect(h.notice()).not.toContain('URL copied.');
  expect(h.writeText).toHaveBeenCalledTimes(1);
});

test('requests already busy in the port block copy, and typed failures stay safe', async () => {
  const h = harness();
  let finish: (value: unknown) => void = () => { throw new Error('Expected pending request'); };
  h.rpc.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = h.port.load();
  await h.button().props.onClick(); expect(h.writeText).not.toHaveBeenCalled();
  await vi.waitFor(() => expect(h.rpc).toHaveBeenCalledTimes(1));
  finish({ visuals: [] }); await pending;
  h.rpc.mockRejectedValueOnce({ code: 'rate_limited', message: 'Private prose', retry_after_ms: 1000 });
  await h.button().props.onClick();
  expect(h.notice()).toContain('rate_limited'); expect(h.notice()).not.toContain('Private prose');
  expect(h.writeText).not.toHaveBeenCalled();
});
