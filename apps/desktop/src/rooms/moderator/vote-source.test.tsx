import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { VoteBarSourceAction } from './vote-source.jsx';
import { createCoreGatehousePort } from '../../gatehouse-core.js';
import type { GatehouseNetwork } from '../../gatehouse-core.js';

test('copy vote-bar source action appears in core mode only, with no hooks in the leaf', () => {
  const props = { busy: false, on_copy: () => undefined };
  expect(renderToStaticMarkup(VoteBarSourceAction({ ...props, mode: 'core' })))
    .toContain('Copy vote-bar browser source URL');
  expect(renderToStaticMarkup(VoteBarSourceAction({ ...props, mode: 'fixture' }))).toBe('');
});

test('copy resolves and validates the core URL and handles clipboard refusal without private prose', async () => {
  const rpc = vi.fn<GatehouseNetwork['rpc']>(async () => ({ url: 'http://localhost:3001/gatehouse/current' }));
  const port = createCoreGatehousePort({ mode: 'core', endpoint: 'http://127.0.0.1:3000/', session_token: 'a'.repeat(64) }, { rpc });
  const write = vi.fn<(url: string) => Promise<void>>(async () => undefined);
  await port.copyVoteBarSource(write);
  expect(rpc.mock.calls[0]?.slice(2)).toEqual(['gatehouse.source.url', {}]);
  expect(write).toHaveBeenCalledWith('http://localhost:3001/gatehouse/current');
  expect(port.getSnapshot().notice).toContain('Vote-bar browser source URL copied');
  await port.copyVoteBarSource(async () => { throw new Error('simulated private clipboard prose'); });
  expect(port.getSnapshot().phase).toBe('error');
  expect(port.getSnapshot().notice).toContain('Clipboard unavailable');
  expect(port.getSnapshot().notice).not.toContain('private');
  rpc.mockResolvedValue({ url: 'http://localhost:3001/gatehouse/current', text: 'simulated private' });
  write.mockClear(); await port.copyVoteBarSource(write);
  expect(write).not.toHaveBeenCalled();
});
