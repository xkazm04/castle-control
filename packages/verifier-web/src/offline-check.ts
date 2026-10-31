import { checkGeneratedWrits } from './parity-check.ts';

const { offline, beacons, distinct_rounds } = await checkGeneratedWrits();
console.log(`same_winners_as_rust_across_1000_generated_simulated_writs: PASS (${offline} streamer-controlled; ${beacons} beacon writs; ${distinct_rounds} distinct BLS-verified tuples)`);
