import { invoke, parseEvent } from '@castle-control/contract';
import type { Source } from './model.js';

export type CoreLaunch = { mode: 'core'; endpoint: string; session_token: string };
export type Socket = Pick<WebSocket, 'onopen' | 'onmessage' | 'onclose' | 'onerror' | 'close'>;
export type Network = {
  socket: (url: string, protocols: string[]) => Socket;
  rpc: typeof invoke;
};
const network: Network = {
  socket: (url, protocols) => new WebSocket(url, protocols),
  rpc: invoke,
};

export function validateCoreLaunch(launch: CoreLaunch) {
  const base = new URL(launch.endpoint);
  if (base.protocol !== 'http:' || base.hostname !== '127.0.0.1' || base.pathname !== '/'
      || base.username || base.password || base.search || base.hash
      || !/^[a-f0-9]{64}$/.test(launch.session_token)) throw new Error('Invalid local shell launch');
  return base;
}

export function createCoreSource(launch: CoreLaunch, transport: Network = network): Source {
  const base = validateCoreLaunch(launch);
  return {
    mode: 'core',
    async read() {
      const [status, bridge] = await Promise.all([
        transport.rpc(base.href, launch.session_token, 'status.get', {}),
        transport.rpc(base.href, launch.session_token, 'bridge.status.get', {}).catch((error: unknown) => {
          // invoke throws the contract's validated ErrorEnvelope on an RPC error.
          if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'unavailable') return undefined;
          throw error;
        }),
      ]);
      return bridge ? { status, bridge } : { status };
    },
    listen(invalidate, unavailable) {
      let stopped = false;
      let interrupted = false;
      let since_seq = 0;
      let socket: Socket | undefined;
      let retry: ReturnType<typeof setTimeout> | undefined;
      function interrupt() {
        interrupted = true;
        unavailable();
      }
      function connect() {
        if (stopped) return;
        const url = new URL('/events', base);
        url.protocol = 'ws:';
        url.searchParams.set('since_seq', String(since_seq));
        try {
          socket = transport.socket(url.href, ['cc-events', `cc-session.${launch.session_token}`]);
        } catch {
          interrupt();
          retry = setTimeout(connect, 1000);
          return;
        }
        const current = socket;
        current.onopen = () => {
          if (stopped || current !== socket) return;
          // The read model owns the initial load; only a reopened connection
          // needs another read. Event invalidations still drain independently.
          if (interrupted) { interrupted = false; invalidate(); }
        };
        current.onmessage = message => {
          if (stopped || current !== socket) return;
          try {
            if (typeof message.data !== 'string') throw new Error('Expected contract text');
            const event = parseEvent(message.data);
            if (event.kind !== 'resync' && event.seq <= since_seq) return;
            since_seq = event.seq;
            invalidate();
          } catch {
            interrupt();
            current.close();
          }
        };
        current.onerror = () => { if (!stopped && current === socket) { interrupt(); current.close(); } };
        current.onclose = () => {
          if (!stopped && current === socket) { interrupt(); retry = setTimeout(connect, 1000); }
        };
      }
      connect();
      return () => {
        stopped = true;
        clearTimeout(retry);
        if (socket) {
          socket.onopen = null; socket.onmessage = null; socket.onclose = null; socket.onerror = null;
          socket.close();
        }
      };
    },
  };
}
