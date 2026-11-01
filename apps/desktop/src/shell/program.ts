import { useRef, useState, useSyncExternalStore } from 'react';
import type { ModuleId } from '@castle-control/ui';
import { proposalQueue } from '@castle-control/ui/steward';
import type { StewardConnection } from '../client.js';
import { programCandidate, proclaimToSampleProgram, sampleProgram } from '../overview/program.js';
import { shellSealAuthority } from './core-steward.js';

/** Shared hold path: authority and Program remain owned by the existing stores. */
export function useSampleProgram(selected: ModuleId, connection?: StewardConnection) {
  const queue = useSyncExternalStore(proposalQueue.subscribe, proposalQueue.getSnapshot, proposalQueue.getSnapshot);
  const program = useSyncExternalStore(sampleProgram.subscribe, sampleProgram.getSnapshot, sampleProgram.getSnapshot);
  const authority = shellSealAuthority(connection);
  const candidate = programCandidate(selected);
  const [notice, setNotice] = useState('');
  const [sealing, setSealing] = useState(false);
  const working = useRef(false);
  async function proclaim() {
    if (!candidate || working.current) return;
    working.current = true; setSealing(true);
    try { setNotice(await proclaimToSampleProgram(candidate.id, authority)); }
    catch { setNotice('The sample seal could not be computed. Program was unchanged.'); }
    finally { working.current = false; setSealing(false); }
  }
  return { queue, program, authority, candidate, notice, sealing, proclaim };
}
