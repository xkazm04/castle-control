import { checkGeneratedWrits } from './parity-check.ts';

await checkGeneratedWrits();
console.log('same_winners_as_rust_across_1000_generated_simulated_writs: PASS (900 streamer-controlled; 100 BLS-verified beacons)');
