import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { parseJson } from '@castle-control/contract/door';
import { startCore } from './core.ts';
import { serveMcp } from './mcp.ts';

/** The package version for serverInfo, read through the contract JSON door. */
export function packageVersion(): string {
  const manifest: unknown = parseJson(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  if (typeof manifest !== 'object' || manifest === null || !('version' in manifest)
    || typeof manifest.version !== 'string') throw new Error('package.json has no version');
  return manifest.version;
}

/**
 * Process entry for the `cc-mcp` bin: stdin lines in, protocol frames on
 * stdout, diagnostics on stderr. The core comes from CC_HEADLESS_EXE, or a
 * cargo build of cc-headless, on a throwaway data root.
 */
export async function runMcp(): Promise<void> {
  const log = (text: string) => { process.stderr.write(text); };
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
  const server = serveMcp({
    lines,
    write: frame => { process.stdout.write(`${frame}\n`); },
    log,
    // Cargo build output goes to stderr; no capability exists during a build.
    openSession: () => startCore({ diagnostics: log }),
    version: packageVersion(),
  });
  const stop = () => {
    lines.close();
    server.shutdown().then(() => process.exit(0), (error: unknown) => {
      log(`cc-mcp: shutdown failed: ${error instanceof Error ? error.message : 'unknown failure'}\n`);
      process.exit(1);
    });
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  // A client that hangs up mid-write leaves nothing to answer: stop the core and leave.
  process.stdout.on('error', stop);
  await server.done;
  process.exitCode = 0;
}
