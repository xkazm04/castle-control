import type { Verdict } from '@castle-control/contract';
import { ballotOption } from './ballot-window.js';
import { fnv, rng } from './random.js';

export const SIMULATED_LABEL = 'SIMULATED';
const chatter = ['this is close', 'gg', 'no way', 'chat is split lol', 'left card is cooler',
  'the right one, trust', 'hype', 'how long left?', 'both bad tbh', 'W stream'];
type GeneratedMessage = { t_ms: number; user_id: string; text: string; verdict: Verdict; reason_codes: string[] };

/** Seed sequence and mix ported from .port/winner/duel-engine.js simulateWindow. */
export function simulateChatPages(match_key: string, window_ms: number, opened_at: string): string[] {
  const random = rng(fnv('window:' + match_key));
  const lean = 0.34 + random() * 0.32;
  const messages: GeneratedMessage[] = [];
  const honest = 74 + Math.floor(random() * 18);
  for (let i = 0; i < honest; i++) {
    const t_ms = Math.floor(400 + Math.pow(random(), 0.85) * (window_ms - 900));
    const user_id = String(100 + Math.floor(random() * 150) * 7);
    const roll = random();
    const details = { t_ms, user_id };
    if (roll < 0.1) {
      messages.push({ ...details, text: `${chatter[Math.floor(random() * chatter.length)]} [generated chatter]`,
        verdict: 'pass', reason_codes: [] });
      continue;
    }
    const option = random() < lean ? 0 : 1;
    if (roll < 0.17) {
      messages.push({ ...details, text: `Cheer100 ${option + 1} [generated cheer]`, verdict: 'pass', reason_codes: [] });
    } else if (roll < 0.21) {
      messages.push({ ...details, text: `${option + 1} https://simulated-link.example [generated link]`,
        verdict: 'hold', reason_codes: ['automod_simulated_link'] });
    } else {
      messages.push({ ...details, text: String(option + 1) + (random() < 0.2 ? '!!' : ''),
        verdict: 'pass', reason_codes: [] });
    }
  }
  messages.sort((a, b) => a.t_ms - b.t_ms);
  const honest_count: [number, number] = [0, 0];
  const seen = new Set<string>();
  for (const message of messages) {
    const option = ballotOption(message.text);
    if (option !== null && message.verdict === 'pass' && !seen.has(message.user_id)) {
      seen.add(message.user_id);
      honest_count[option]++;
    }
  }
  const trailing = honest_count[0] <= honest_count[1] ? 0 : 1;
  const burst = Math.abs(honest_count[0] - honest_count[1]) + 7 + Math.floor(random() * 6);
  const burst_at = Math.floor(window_ms * (0.42 + random() * 0.12));
  for (let i = 0; i < burst; i++) {
    messages.push({ t_ms: burst_at + i * 70, user_id: String(900 + i),
      text: `${(String(trailing + 1) + ' ').repeat(5)}[generated spam]`,
      verdict: 'bar', reason_codes: ['repeated_message_spam'] });
  }
  messages.push({ t_ms: Math.floor(window_ms * 0.7), user_id: '977',
    text: `[generated blocked term] ${2 - trailing}`, verdict: 'bar', reason_codes: ['blocked_term'] });
  messages.sort((a, b) => a.t_ms - b.t_ms);
  const start_ms = Date.parse(opened_at);
  const hash = fnv(match_key).toString(16).toUpperCase().padStart(8, '0');
  const items = messages.map((message, index) => {
    const at = new Date(start_ms + message.t_ms).toISOString();
    const message_id = `simulated-${hash}-${index + 1}`;
    return {
      message: { message_id, user_id: message.user_id, at, text: message.text },
      decision: { decision_id: `0${hash}${String(index + 1).padStart(17, '0')}`, message_id,
        at, kind: message.verdict === 'hold' ? 'held' : message.verdict === 'bar' ? 'would_act' : 'released',
        operator: 'ai', verdict: message.verdict, reason_codes: ['simulated', ...message.reason_codes] },
      provenance: 'simulated',
    };
  });
  const pages: string[] = [];
  for (let offset = 0; offset < items.length; offset += 100) {
    pages.push(JSON.stringify({ items: items.slice(offset, offset + 100), unavailable_count: 0,
      ...(offset + 100 < items.length ? { next_cursor: `chat:${offset + 100}` } : {}) }));
  }
  return pages;
}
