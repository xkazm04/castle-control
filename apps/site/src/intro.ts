import { introDurationMs } from './machine.ts';
import type { Event } from './machine.ts';

export type IntroHost = {
  schedule: (run: () => void, delay: number) => number;
  cancel: (timer: number) => void;
  handover: (event: Event) => void;
  showSkip: (show: boolean) => void;
  skipFocused: () => boolean;
  focusFirst: () => void;
};

// Timer and activation policy are independent of the DOM, with a controlled-clock test.
export function createIntro(host: IntroHost, active: boolean) {
  let printing = active;
  let retained = false;
  let timer: number | undefined;
  const cancel = (): void => {
    if (timer !== undefined) host.cancel(timer);
    timer = undefined;
  };
  function finish(event: Event, retain = false): void {
    cancel();
    retained = retain && (printing || retained);
    const focused = host.skipFocused();
    const ended = printing;
    printing = false;
    host.showSkip(retained);
    if (ended) host.handover(event);
    if (!retained && (event.type === 'skip' || focused)) host.focusFirst();
  }
  host.showSkip(active);
  if (active) timer = host.schedule(() => finish({ type: 'timeout' }), introDurationMs);

  return {
    // Every key ends printing. Retain the native target for Tab and Enter/Space until
    // click/blur: hiding on the press would prevent native Space activation on release.
    key: (key: string, onSkip: boolean): void => finish({ type: 'input' }, key === 'Tab' || (onSkip && (key === 'Enter' || key === ' '))),
    pointer: (onSkip: boolean): void => { if (!onSkip) finish({ type: 'input' }); },
    skip: (): void => finish({ type: 'skip' }),
    blur: (): void => { retained = false; host.showSkip(false); },
    sync: (intro: boolean): void => { if (!intro) { cancel(); printing = false; if (!retained) host.showSkip(false); } },
    reduce: (): void => finish({ type: 'input' }),
    dispose: cancel,
  };
}
