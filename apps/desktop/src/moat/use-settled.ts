import { useEffect, useRef, useState } from 'react';

/**
 * A value for a screen reader to speak. While `hold` is true (the replay is running) it moves at most every
 * `every_ms`, so a busy night never reads out a hundred counts. Otherwise it follows the value after `after_ms`
 * of stillness, so dragging the scrubber speaks once where the hand stops.
 */
export function useSettled<T>(value: T, hold: boolean, every_ms = 2000, after_ms = 400): T {
  const [settled, setSettled] = useState(value);
  const latest = useRef(value);
  latest.current = value;
  useEffect(() => {
    if (!hold) return;
    // Pressing Play is spoken at once, then the count follows at a calm pace.
    setSettled(latest.current);
    const id = setInterval(() => { setSettled(latest.current); }, every_ms);
    return () => { clearInterval(id); };
  }, [hold, every_ms]);
  useEffect(() => {
    if (hold) return;
    const id = setTimeout(() => { setSettled(value); }, after_ms);
    return () => { clearTimeout(id); };
  }, [hold, value, after_ms]);
  return settled;
}
