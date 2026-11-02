// SIMULATED in-process stand-in for cc-headless, for unit tests only. It
// answers /rpc with a Bearer check, a minimal /events WebSocket and one
// overlay push route. All data is generated; nothing here is real chat.
// Imports only the contract's plain-JS JSON door, so a plain `node` child can run it.
import { createHash, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import { parseJson } from '@castle-control/contract/door';

export type FakeHandoff = { endpoint: string; token: string; overlay_origin: string };
export type FakeCore = { handoff: FakeHandoff; methods: string[]; close(): Promise<void> };

type Envelope = { code: string; message: string };
class Refusal {
  readonly status: number;
  readonly envelope: Envelope;
  constructor(status: number, code: string, message: string) {
    this.status = status;
    this.envelope = { code, message };
  }
}

const now = () => new Date().toISOString();

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
  });
}

function frame(text: string): Buffer {
  const payload = Buffer.from(text, 'utf8');
  if (payload.length < 126) return Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
  const header = Buffer.alloc(4);
  header.writeUInt8(0x81, 0);
  header.writeUInt8(126, 1);
  header.writeUInt16BE(payload.length, 2);
  return Buffer.concat([header, payload]);
}

export async function startFakeCore(): Promise<FakeCore> {
  const token = randomBytes(32).toString('hex');
  const methods: string[] = [];
  const events: { seq: number; at: string; kind: string }[] = [];
  const sockets = new Set<Duplex>();
  const rehearsal = { active: false, crowd: 0 };
  const publish = (kind: string) => events.push({ seq: events.length + 1, at: now(), kind });
  const status = () => ({ active: rehearsal.active, at: now(), crowd_per_minute: rehearsal.crowd,
    obs: { connected: false } });

  function answer(method: string, params: Record<string, unknown>): unknown {
    switch (method) {
      case 'status.get':
        return { at: now(), version: '0.0.0-simulated', uptime_ms: 1, twitch_connected: false,
          obs_connected: false, simulated: true };
      case 'obs.status.get': return { connected: false };
      case 'gatehouse.rules.list': return { rules: [] };
      case 'rehearsal.start': rehearsal.active = true; publish('rehearsal.status'); return status();
      case 'rehearsal.stop': rehearsal.active = false; publish('rehearsal.status'); return status();
      case 'rehearsal.crowd.set':
        rehearsal.crowd = Number(params.per_minute); publish('rehearsal.status'); return status();
      case 'rehearsal.scenario.run':
        if (!rehearsal.active) throw new Refusal(409, 'conflict', 'start a rehearsal first');
        publish('gatehouse.consensus');
        return { accepted: true };
      case 'auth.twitch.start': throw new Refusal(403, 'blocked_by_policy', 'dress rehearsal has no Twitch login');
      default: throw new Refusal(503, 'unavailable', 'method is not registered yet');
    }
  }

  function send(response: ServerResponse, status: number, body: unknown) {
    response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
  }

  async function rpc(request: IncomingMessage, response: ServerResponse) {
    if (request.method !== 'POST' || request.url !== '/rpc') return send(response, 404, { code: 'not_found', message: 'no route' });
    if (request.headers.authorization !== `Bearer ${token}`) {
      return send(response, 401, { code: 'unauthorized', message: 'session capability required' });
    }
    if (request.headers.origin !== undefined) return send(response, 403, { code: 'unauthorized', message: 'origin refused' });
    let body = '';
    for await (const chunk of request) body += String(chunk);
    const parsed: unknown = parseJson(body);
    if (!parsed || typeof parsed !== 'object' || !('method' in parsed) || typeof parsed.method !== 'string'
      || !('params' in parsed) || !parsed.params || typeof parsed.params !== 'object') {
      return send(response, 400, { code: 'invalid', message: 'invalid request' });
    }
    methods.push(parsed.method);
    try {
      return send(response, 200, answer(parsed.method, { ...parsed.params }));
    } catch (error) {
      if (error instanceof Refusal) return send(response, error.status, error.envelope);
      throw error;
    }
  }

  const core = createServer((request, response) => {
    rpc(request, response).catch(() => send(response, 500, { code: 'internal', message: 'fake core failed' }));
  });
  core.on('upgrade', (request: IncomingMessage, socket: Duplex) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const offered = String(request.headers['sec-websocket-protocol'] ?? '').split(',').map(value => value.trim());
    if (url.pathname !== '/events' || !offered.includes(`cc-session.${token}`) || request.headers.origin !== undefined) {
      socket.end('HTTP/1.1 401 Unauthorized\r\ncontent-length: 0\r\n\r\n');
      return;
    }
    const accept = createHash('sha1')
      .update(`${String(request.headers['sec-websocket-key'])}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
    socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`, 'Sec-WebSocket-Protocol: cc-events', '', ''].join('\r\n'));
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    // Any client frame (its close) ends the session; the fake never parses input.
    socket.on('data', () => socket.destroy());
    socket.on('error', () => socket.destroy());
    const since = Number(url.searchParams.get('since_seq') ?? events.length);
    for (const event of events.filter(event => event.seq > since)) socket.write(frame(JSON.stringify(event)));
  });

  const overlay = createServer((request, response) => {
    if (request.url !== '/push/gatehouse') {
      response.writeHead(request.url === '/push/tiltyard' ? 503 : 404).end();
      return;
    }
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.write(':\n\n');
    response.write(`event: gatehouse.render.snapshot\ndata: ${JSON.stringify({ at: now(), directions: [],
      simulated: true })}\n\n`);
  });

  const [corePort, overlayPort] = await Promise.all([listen(core), listen(overlay)]);
  return {
    handoff: { endpoint: `http://127.0.0.1:${corePort}/`, token, overlay_origin: `http://localhost:${overlayPort}` },
    methods,
    async close() {
      for (const socket of sockets) socket.destroy();
      core.closeAllConnections();
      overlay.closeAllConnections();
      await Promise.all([core, overlay].map(server => new Promise(resolve => server.close(resolve))));
    },
  };
}
