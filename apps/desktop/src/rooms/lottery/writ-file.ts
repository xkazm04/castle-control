import { parseMethodResult } from '@castle-control/contract';
import { lotsWritGet } from '@castle-control/contract/lots';
import type { LotsWrit } from '@castle-control/contract';

/** A 10,000-entry writ is well under 1 MiB; anything larger is refused before it is read. */
export const writ_file_limit = 2 * 1024 * 1024;

/** A writ file crosses a boundary: it is parsed by the contract's own lots.writ.get schema, exactly as
 * a proof bundle from the core is. Undefined for anything that is not a v1 lots writ. */
export function readWritFile(text: string): LotsWrit | undefined {
  try { return parseMethodResult(lotsWritGet, text); } catch { return undefined; }
}
