import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import type { ContributionSource } from '@castle-control/contract';
import { rowHeight } from '@castle-control/ui';
import { createCoreBeaconsPort } from '../../beacons-core.js';
import type { BeaconsNetwork } from '../../beacons-core.js';
import { createDesktopClient } from '../../client.js';
import { ConnectedBeacons } from './core.jsx';
import { LiveContributionFeed } from './live-feed.jsx';
import Room, { VisualsWork } from './room.jsx';

const launch = { mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) } as const;
// Synthetic boundary inputs, unrelated to any channel or real viewer.
const contribution = { source: 'cheer', amount: 123, broadcaster_id: '100', event_id: 'synthetic-cheer',
  dedupe_key: 'synthetic-cheer', user_id: '200' } as const;
function harness() {
  const rpc = vi.fn<BeaconsNetwork['rpc']>(async () => ({ items: [contribution] }));
  const port = createCoreBeaconsPort(launch, { rpc });
  return { rpc, port, html: () => renderToStaticMarkup(<ConnectedBeacons port={port} />) };
}
afterEach(() => { vi.restoreAllMocks(); });

test('connected room separates live core rows from the unchanged simulated feed', async () => {
  const h = harness(); await h.port.loadContributions({ limit: 100 });
  const html = h.html();
  expect(html).toContain('Contribution feed · live from core');
  // C uses a boxed amount and separate source cell.
  expect(html).toContain('>123</b>'); expect(html).toContain('class="cc-feed-text">Bits cheer</span>'); expect(html).toContain('user ID 200');
  // C puts the simulated qualifier in CardHead's gloss.
  expect(html).toContain('<h2>Contribution feed</h2><span>simulated</span>');
  expect(html).toContain('0 simulated events · Core simulation');
  expect(html.match(/data-live-contribution-row=/g)).toHaveLength(1);
  expect(html).not.toContain('data-contribution-row=');
});

test.each(['cheer', 'bits_use', 'subscribe', 'gift', 'resub', 'hype_train', 'channel_points', 'charity', 'goal', 'power_up'] as const)(
  'live %s rows show their native units and omit absent user IDs', async source => {
    const labels: Record<ContributionSource, string> = { cheer: 'Bits cheer', bits_use: 'Bits use', subscribe: 'subscriptions',
      gift: 'gift subscriptions', resub: 'resubscriptions', hype_train: 'Hype Train level', channel_points: 'channel points',
      charity: 'charity minor currency units', goal: 'goal minor currency units', power_up: 'power-ups' };
    const h = harness();
    h.rpc.mockResolvedValueOnce({ items: [{ source, amount: 3, broadcaster_id: '100', event_id: 'synthetic-anonymous', dedupe_key: 'synthetic-anonymous' }] });
    await h.port.loadContributions({ limit: 100 });
    const html = renderToStaticMarkup(<LiveContributionFeed read={h.port.getSnapshot().contributions} on_refresh={vi.fn()} />);
    // C retains the amount and source in separate cells.
    expect(html).toContain('>3</b>'); expect(html).toContain(`class="cc-feed-text">${labels[source]}</span>`);
    expect(html).not.toContain('user ID');
  },
);

// C retains the live window and order with the same 48px amount-row geometry as the simulated feed.
test('core-returned order is retained and live rows use bounded, keyboard-reachable windows', async () => {
  const h = harness();
  const items = Array.from({ length: 100 }, (_, index) => ({ ...contribution,
    amount: index + 1, event_id: `synthetic-${index}`, dedupe_key: `synthetic-${index}` }));
  h.rpc.mockResolvedValueOnce({ items }); await h.port.loadContributions({ limit: 100 });
  const read = h.port.getSnapshot().contributions;
  const render = (scroll_top: number) => renderToStaticMarkup(<LiveContributionFeed read={read} on_refresh={vi.fn()} scroll_top={scroll_top} />);
  const first = render(0); const last = render(100 * rowHeight * 1.5);
  expect(first).toContain('aria-rowcount="100"'); expect(first).toContain('tabindex="0"');
  expect(first.match(/data-live-contribution-row=/g)?.length).toBeLessThan(20);
  expect(first).toContain('data-live-contribution-row="synthetic-0"');
  expect(first.indexOf('synthetic-0')).toBeLessThan(first.indexOf('synthetic-1'));
  expect(first).not.toContain('data-live-contribution-row="synthetic-99"');
  expect(last).toContain('data-live-contribution-row="synthetic-99"');
  expect(last).not.toContain('data-live-contribution-row="synthetic-0"');
});

test('failed and malformed live reads show unavailable, clear old rows and never borrow simulated rows', async () => {
  const h = harness(); await h.port.loadContributions({ limit: 100 });
  for (const outcome of ['failure', 'malformed'] as const) {
    if (outcome === 'failure') h.rpc.mockRejectedValueOnce(new Error('Private upstream prose'));
    else h.rpc.mockResolvedValueOnce({ items: [{ ...contribution, amount: -1 }] });
    await h.port.loadContributions({ limit: 100 });
    const html = h.html();
    expect(html).toContain('Live contribution feed unavailable');
    expect(html).not.toContain('data-live-contribution-row=');
    expect(html).not.toContain('Private upstream prose');
    // C puts the simulated qualifier in CardHead's gloss.
    expect(html).toContain('<h2>Contribution feed</h2><span>simulated</span>');
  }
});

test('a successful empty read is distinct from an unavailable feed', async () => {
  const h = harness(); h.rpc.mockResolvedValueOnce({ items: [] });
  await h.port.loadContributions({ limit: 100 });
  const html = h.html();
  expect(html).toContain('No live contributions in the core read.');
  expect(html).not.toContain('Live contribution feed unavailable');
});

test('native refresh loads a core page and remains disabled while the live read is pending', async () => {
  const h = harness();
  const on_refresh = () => h.port.loadContributions({ limit: 100 });
  // C's CardBody wraps the unchanged native refresh button.
  const control = () => LiveContributionFeed({ read: h.port.getSnapshot().contributions, on_refresh }).props.children[1].props.children[0];
  expect(control().type).toBe('button'); expect(control().props.type).toBe('button');
  expect(control().props.disabled).toBe(false);
  expect(h.html()).toContain('Live contributions have not been loaded.');
  const pending = control().props.onClick();
  expect(control().props.disabled).toBe(true);
  expect(h.html()).toContain('Loading live contributions from the core.');
  await pending;
  expect(h.rpc).toHaveBeenCalledExactlyOnceWith(launch.endpoint, launch.session_token, 'beacons.contribution.list', { limit: 100 });
  expect(control().props.disabled).toBe(false);
  expect(h.html()).toContain('>123</b>'); expect(h.html()).toContain('class="cc-feed-text">Bits cheer</span>');
});

test('fixture mode keeps the simulated label and issues no contribution RPC or other network call', async () => {
  const network = vi.spyOn(globalThis, 'fetch');
  const client = createDesktopClient({ mode: 'fixture' });
  const stop = client.start();
  try {
    await vi.waitFor(() => expect(client.getSnapshot().phase).toBe('ready'));
    const room = Room({ snapshot: client.getSnapshot() });
    expect(room.type).toBe(VisualsWork);
    const html = renderToStaticMarkup(room);
    // C puts the simulated qualifier in CardHead's gloss.
    expect(html).toContain('<h2>Contribution feed</h2><span>simulated</span>');
    expect(html).not.toContain('Contribution feed · live from core');
    expect(network).not.toHaveBeenCalled();
  } finally { stop(); }
});
