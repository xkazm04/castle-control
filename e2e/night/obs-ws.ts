// Minimal obs-websocket v5 client for the isolated night OBS (never 4455). The
// password is a per-run value held in memory; it is never logged or returned.
import { createHash } from 'node:crypto';

type Frame = { op: number; d: Record<string, unknown> };
type Pending = { resolve: (data: Record<string, unknown>) => void; reject: (error: Error) => void };

const sha = (text: string) => createHash('sha256').update(text).digest('base64');

function frame(text: unknown): Frame {
  const value: unknown = JSON.parse(String(text));
  if (!value || typeof value !== 'object' || !('op' in value) || typeof value.op !== 'number'
    || !('d' in value) || !value.d || typeof value.d !== 'object') throw new Error('Invalid obs-websocket frame');
  return { op: value.op, d: Object.fromEntries(Object.entries(value.d)) };
}

// Plain fields, no parameter properties: Node's type stripping runs this file in obs.mjs.
export class ObsRequestError extends Error {
  readonly requestType: string;
  readonly code: number;
  constructor(requestType: string, code: number, comment: string) {
    super(`${requestType} refused (${code}): ${comment}`);
    this.requestType = requestType;
    this.code = code;
  }
}

export class ObsSocket {
  private sequence = 0;
  private readonly pending = new Map<string, Pending>();
  private readonly socket: WebSocket;
  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener('message', event => {
      const message = frame(event.data);
      if (message.op !== 7) return;
      const id = String(message.d.requestId);
      const waiting = this.pending.get(id);
      if (!waiting) return;
      this.pending.delete(id);
      const status = message.d.requestStatus;
      const ok = status && typeof status === 'object' && 'result' in status && status.result === true;
      const code = status && typeof status === 'object' && 'code' in status ? Number(status.code) : -1;
      const comment = status && typeof status === 'object' && 'comment' in status ? String(status.comment) : '';
      const data = message.d.responseData;
      if (ok) waiting.resolve(data && typeof data === 'object' ? Object.fromEntries(Object.entries(data)) : {});
      else waiting.reject(new ObsRequestError(String(message.d.requestType), code, comment));
    });
    socket.addEventListener('close', () => {
      for (const waiting of this.pending.values()) waiting.reject(new Error('obs-websocket closed'));
      this.pending.clear();
    });
  }

  /** Connect and identify within `timeoutMs`, or throw. */
  static async connect(port: number, password: string, timeoutMs = 5_000): Promise<ObsSocket> {
    if (port === 4455) throw new Error('Refusing the owner OBS websocket port 4455');
    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        new Promise<void>((resolve, reject) => {
          socket.addEventListener('error', () => reject(new Error('obs-websocket connection failed')), { once: true });
          socket.addEventListener('close', event => reject(new Error(`obs-websocket closed (${event.code})`)), { once: true });
          socket.addEventListener('message', event => {
            const hello = frame(event.data);
            if (hello.op === 2) { resolve(); return; }
            if (hello.op !== 0) { reject(new Error('Unexpected obs-websocket hello')); return; }
            const identify: Record<string, unknown> = { rpcVersion: 1, eventSubscriptions: 0 };
            const auth = hello.d.authentication;
            if (auth && typeof auth === 'object' && 'salt' in auth && 'challenge' in auth) {
              identify.authentication = sha(sha(`${password}${String(auth.salt)}`) + String(auth.challenge));
            }
            socket.send(JSON.stringify({ op: 1, d: identify }));
          });
        }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('obs-websocket identify timed out')), timeoutMs); }),
      ]);
    } catch (error) {
      socket.close();
      throw error;
    } finally { clearTimeout(timer); }
    return new ObsSocket(socket);
  }

  request(requestType: string, requestData: Record<string, unknown> = {}, timeoutMs = 10_000): Promise<Record<string, unknown>> {
    const requestId = `night-${++this.sequence}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`${requestType} timed out`));
      }, timeoutMs);
      this.pending.set(requestId, {
        resolve: data => { clearTimeout(timer); resolve(data); },
        reject: error => { clearTimeout(timer); reject(error); },
      });
      this.socket.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
    });
  }

  close(): void { this.socket.close(); }
}

/** Decode an obs-websocket BMP data URI and return the share of visible pixels. */
export function visibleShare(dataUri: string): number {
  const bytes = Buffer.from(dataUri.slice(dataUri.indexOf(',') + 1), 'base64');
  if (bytes.toString('latin1', 0, 2) !== 'BM') throw new Error('Expected a BMP screenshot');
  const offset = bytes.readUInt32LE(10);
  const width = bytes.readInt32LE(18);
  const height = Math.abs(bytes.readInt32LE(22));
  const bits = bytes.readUInt16LE(28);
  if (bits !== 32 && bits !== 24) throw new Error(`Unsupported BMP depth ${bits}`);
  const stride = Math.ceil((width * bits) / 32) * 4;
  const pixels: [number, number, number, number][] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = offset + y * stride + x * (bits / 8);
      pixels.push([bytes[at + 2] ?? 0, bytes[at + 1] ?? 0, bytes[at] ?? 0, bits === 32 ? bytes[at + 3] ?? 0 : 255]);
    }
  }
  // Some encoders write a 32-bit BMP whose alpha bytes are all zero: treat that as no alpha.
  const alpha = pixels.some(pixel => pixel[3] !== 0);
  // Transparent, or black where there is no alpha (a capture of a transparent page), is blank.
  const visible = pixels.filter(([r, g, b, a]) => (!alpha || a > 8) && r + g + b > 24).length;
  return visible / pixels.length;
}
