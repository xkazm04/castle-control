// SIMULATED cc-headless launcher for tests: `node fake-launcher.ts <data_root>`.
// Prints the handoff line, then deliberately echoes the token on stdout and
// stderr so tests can prove the client never forwards core output. Exits when
// stdin closes, like the real launcher.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startFakeCore } from './fake-core.ts';

const root = process.argv[2];
if (!root) {
  process.stderr.write('usage: fake-launcher <data_root>\n');
  process.exit(2);
}
writeFileSync(join(root, 'SIMULATED-core-state.txt'), 'SIMULATED\n');
const core = await startFakeCore();
process.stdout.write(`${JSON.stringify(core.handoff)}\n`);
process.stdout.write(`leak-probe ${core.handoff.token}\n`);
process.stderr.write(`leak-probe ${core.handoff.token}\n`);
process.stdin.resume();
process.stdin.on('end', () => {
  core.close().then(() => process.exit(0), () => process.exit(1));
});
