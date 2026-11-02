import type { ConnectDraft } from './steward-flows.js';
import { rehearsalCopy as copy } from './rehearsal-copy.js';

/**
 * Where the OBS password field stands. The field is one page-owned, masked, uncontrolled input
 * rendered into a host element the page keeps for its whole life, so its typed value survives
 * moves. While the Steward's "Connect my OBS" flow waits at its hold, the page moves that host
 * into the active step card (right under the Steward's line); otherwise the host sits in the
 * page's connection form. Only the host's placement changes: the value is never copied, never
 * enters React state, the flow draft, a conversation beat, a log or a URL, and the hold reads
 * it once through submitConnection, which clears it straight after.
 */
export const secretStep = 'seal';
const dockStep = `.cc-steward-dock[data-chamber="rehearsal"] .cc-steward-step[data-step="${secretStep}"]`;

/** The connect draft wants the masked field only when OBS asks for a password. */
export const wantsSecret = (draft: ConnectDraft | undefined) => draft?.secret === 'yes';

/** The minimal DOM this placement touches, so it can be checked without a browser. */
export type SlotNode<N> = {
  readonly parentElement: unknown;
  readonly nextElementSibling: unknown;
  querySelector(selector: string): N | null;
  after(node: N): void;
  append(node: N): void;
  remove(): void;
};

export function placeSecret<N extends SlotNode<N>>(host: N, home: N | null, page: { querySelector(selector: string): N | null }, wanted: boolean): 'step' | 'home' | 'none' {
  const step = wanted ? page.querySelector(dockStep) : null;
  const prompt = step?.querySelector(':scope > .cc-steward-step__prompt') ?? null;
  if (step && prompt) {
    if (prompt.nextElementSibling !== host) prompt.after(host);
    return 'step';
  }
  if (home) {
    if (host.parentElement !== home) home.append(host);
    return 'home';
  }
  if (host.parentElement) host.remove();
  return 'none';
}

/** The masked field itself: uncontrolled, never autofilled, no value prop and no change handler. */
export function SecretField({ disabled, input_ref }: { disabled: boolean; input_ref?: (node: HTMLInputElement | null) => void }) {
  return <label className="cc-field rh-secret">{copy.password}
    <input ref={input_ref} className="cc-input" name="password" type="password" autoComplete="off"
      aria-describedby="rehearsal-password-help" disabled={disabled} />
    <span className="rh-secret__note" id="rehearsal-password-help">{copy.password_help} Read once at your hold, then cleared; the Steward never sees it.</span>
  </label>;
}
