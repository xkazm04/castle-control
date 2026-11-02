import type { GatehouseChatResult, GatehouseHistoryResult, GatehouseReadDecision } from '@castle-control/contract';

/** The core keeps a ban proposal open for review this long (cc-gatehouse REVIEW_TIMEOUT_S). */
export const BAN_REVIEW_S = 120;
/** One poll reads at most this many pages per ledger view; the next poll resumes after them. */
const MAX_PAGES = 20;

type Decision = GatehouseReadDecision;
type UserId = GatehouseChatResult['items'][number]['message']['user_id'];
export type BanProposal = { decision_id: Decision['decision_id']; message_id: Decision['message_id']; rule_id?: NonNullable<Decision['rule_id']>;
  at: Decision['at']; simulated: boolean; user_id?: UserId; text?: string };
export type BanOutcome = { decision_id: Decision['decision_id']; message_id: Decision['message_id']; kind: Decision['kind'];
  reason: string; at: Decision['at']; simulated: boolean; rule_id?: NonNullable<Decision['rule_id']>; user_id?: UserId };
export type BanReview = { pending: readonly BanProposal[]; expired: number; outcomes: readonly BanOutcome[] };

type Page<T> = { items: readonly T[]; next_cursor?: string };
type Read = { history: (cursor?: string) => Promise<GatehouseHistoryResult>; chat: (cursor?: string) => Promise<GatehouseChatResult> };
const REVIEW_REASONS = ['ban_confirmed', 'ban_dismissed', 'review_expired_or_withheld'];

/**
 * Derives the ban review from the core's existing append-ordered reads: a `ban_pending`
 * decision is open until a human review decision for the same message follows it. Reads
 * resume from the last full page, so a long rehearsal is not re-read on every poll.
 */
export function createBanTracker(read: Read) {
  const proposals = new Map<string, BanProposal>();
  const outcomes = new Map<string, BanOutcome>();
  const lines = new Map<string, { user_id: UserId; text: string }>();
  const resume: { history?: string; chat?: string } = {};
  async function walk<T>(key: 'history' | 'chat', page: (cursor?: string) => Promise<Page<T>>, take: (item: T) => void) {
    for (let count = 0; count < MAX_PAGES; count++) {
      const result = await page(resume[key]);
      for (const item of result.items) take(item);
      // A page with a next cursor is complete; the final partial page is read again next time.
      if (!result.next_cursor) return;
      resume[key] = result.next_cursor;
    }
  }
  return {
    async refresh(now = Date.now()): Promise<BanReview> {
      await walk('history', read.history, ({ decision, provenance }) => {
        const simulated = provenance === 'simulated';
        if (decision.kind === 'ban_pending') {
          proposals.set(decision.decision_id, { decision_id: decision.decision_id, message_id: decision.message_id,
            at: decision.at, simulated, ...(decision.rule_id === undefined ? {} : { rule_id: decision.rule_id }) });
        }
        const reason = decision.reason_codes.find(code => REVIEW_REASONS.includes(code));
        if (decision.operator === 'human' && reason) {
          outcomes.set(decision.message_id, { decision_id: decision.decision_id, message_id: decision.message_id,
            kind: decision.kind, reason, at: decision.at, simulated });
        }
      });
      // Text and author come only from the recorded chat line, never from the decision.
      await walk('chat', read.chat, ({ decision, message }) => {
        if (decision.kind === 'ban_pending') lines.set(decision.decision_id, { user_id: message.user_id, text: message.text });
      });
      const proposed = [...proposals.values()].map(item => ({ ...item, ...lines.get(item.decision_id) }));
      const open = proposed.filter(item => !outcomes.has(item.message_id));
      const named = [...outcomes.values()].map(outcome => {
        const source = proposed.find(item => item.message_id === outcome.message_id);
        return { ...outcome, ...(source?.user_id === undefined ? {} : { user_id: source.user_id }),
          ...(source?.rule_id === undefined ? {} : { rule_id: source.rule_id }) };
      });
      const fresh = open.filter(item => now - Date.parse(item.at) < BAN_REVIEW_S * 1000);
      return { pending: fresh.reverse(), expired: open.length - fresh.length,
        outcomes: named.reverse().slice(0, 5) };
    },
  };
}
