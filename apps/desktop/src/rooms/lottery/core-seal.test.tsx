import { renderToReadableStream } from 'react-dom/server';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { LiveSteward, proposalQueue } from '@castle-control/ui/steward';
import { coreLotsConnection, createDesktopClient } from '../../client.js';
import type { StewardConnection } from '../../client.js';
import { lotsCopy as copy } from '../../lots-copy.js';
import { fixtureDraws } from '../../lots-fixture.js';
import type { Snapshot } from '../../model.js';
import { shellStewardPort } from '../../shell/core-steward.js';
import Room from '../../shell/room.jsx';

const launch = { mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) } as const;

function clearProposals() {
  for (const proposal of proposalQueue.pending()) proposalQueue.tearUp(proposal.id);
  proposalQueue.select();
}
beforeEach(clearProposals);
afterEach(() => { clearProposals(); vi.unstubAllGlobals(); });

async function render(snapshot: Snapshot, connection?: StewardConnection) {
  const stream = await renderToReadableStream(<Room chamber="lottery" replay={false} snapshot={snapshot}
    {...(connection ? { connection } : {})} origin="keep" on_open={vi.fn()} on_back={vi.fn()} />);
  await stream.allReady;
  return (await new Response(stream).text()).replace(/<!--.*?-->/g, '');
}

async function loadedSnapshot() {
  const rpc = vi.fn(async (_endpoint: string, _session: string, method: string) =>
    method === 'lots.draw.list' ? { draws: fixtureDraws } : { result: 'ok', reasons: [] });
  const snapshot = createDesktopClient(launch, undefined, { rpc }).getSnapshot();
  await render(snapshot);
  const port = coreLotsConnection(snapshot)?.port;
  if (!port) throw new Error('Expected the core Lots port');
  await port.load();
  expect(port.getSnapshot().draw).toBeDefined();
  expect(port.getSnapshot().check?.result).toBe('ok');
  return snapshot;
}

test.each(['absent', 'simulated', 'unreachable'] as const)(
  'core lottery with an %s Steward port exposes only its working draw seal', async kind => {
    const snapshot = await loadedSnapshot();
    const connection = kind === 'absent' ? undefined : {
      launch, live: kind !== 'simulated', reachable: () => kind !== 'unreachable',
    };
    const markup = await render(snapshot, connection);
    expect(markup.match(/aria-label="Hold to seal"/g)).toHaveLength(1);
    expect(markup).toMatch(/<button(?![^>]*disabled)[^>]*aria-label="Hold to seal"/);
    expect(markup).toContain(copy.core.seal_notice);
    expect(markup).not.toContain('Live actions are unavailable.');
    expect(markup).not.toContain('Nothing acts until you hold to seal.');
    expect(markup).not.toContain('lottery-seal-frame');
    expect(markup).not.toContain('aria-label="Seal slot"');
  },
);

test.each(['absent', 'simulated', 'unreachable'] as const)(
  'unavailable core lottery omits the disabled shell slot with an %s Steward port', async kind => {
    const connection = kind === 'absent' ? undefined : {
      launch, live: kind !== 'simulated', reachable: () => kind !== 'unreachable',
    };
    const markup = await render({ mode: 'core', phase: 'connecting' }, connection);
    expect(markup).toContain(copy.core.unavailable);
    expect(markup).not.toContain('Live actions are unavailable.');
    expect(markup).not.toContain('Nothing acts until you hold to seal.');
    expect(markup).not.toContain('lottery-seal-frame');
    expect(markup).not.toContain('aria-label="Seal slot"');
    expect(markup).not.toContain('aria-label="Hold to seal"');
  },
);

test('live Steward proposals retain their own review slot with a heading distinct from the draw seal', async () => {
  const snapshot = await loadedSnapshot();
  // Generated configuration only; no Twitch chat or real service is used.
  const transport = {
    ask: vi.fn(async () => JSON.stringify({ writ: {
      writ_id: '01ARZ3NDEKTSV4RRFFQ69G5FAV', chamber: 'lots', status: 'proposed',
      created_at: '2026-10-28T00:00:00Z', updated_at: '2026-10-28T00:00:01Z',
      proposal: { method: 'lots.draw.upsert', diff: { after: { draw: fixtureDraws[0] } } },
    } })),
    seal: vi.fn(), tear: vi.fn(),
  };
  const connection = { launch, live: true, reachable: () => true, transport };
  const port = shellStewardPort(connection);
  if (!(port instanceof LiveSteward)) throw new Error('Expected live Steward capability');
  const turn = await port.ask('Draft a question draw', { surface: 'room', chamber: 'lottery' });
  expect(turn.proposals).toHaveLength(1);
  const markup = await render(snapshot, connection);
  const slotStart = markup.indexOf('class="lottery-seal-frame"');
  const slot = markup.slice(slotStart, markup.indexOf('aria-label="Entry lookup"'));
  expect(slot).toContain('<h2 class="lottery-card-title">Seal Steward proposals</h2>');
  expect(slot).toContain('LIVE STEWARD');
  expect(slot).toContain('Draw configuration');
  expect(slot.match(/aria-label="Hold to seal"/g)).toHaveLength(1);
  expect(slot).not.toContain(copy.core.seal_notice);
  const draw = markup.slice(0, slotStart);
  expect(draw).toContain(copy.core.seal_notice);
  expect(draw.match(/aria-label="Hold to seal"/g)).toHaveLength(1);
  expect(markup).not.toContain('Live actions are unavailable.');
  expect(transport.seal).not.toHaveBeenCalled();
  expect(transport.tear).not.toHaveBeenCalled();
  const unavailable = await render({ mode: 'core', phase: 'connecting' }, connection);
  expect(unavailable).toContain(copy.core.unavailable);
  expect(unavailable).toContain('<h2 class="lottery-card-title">Seal Steward proposals</h2>');
  expect(unavailable).toContain('LIVE STEWARD');
  expect(unavailable.match(/aria-label="Hold to seal"/g)).toHaveLength(1);
});
