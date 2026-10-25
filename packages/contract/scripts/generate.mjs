// Port of Shadowrunr OS packages/contract/scripts/generate.mjs @ 7e4b6f8; Apache-2.0, NOTICE.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { artifacts, differences, exportSchema, output } from './codegen.mjs';

const files = artifacts(exportSchema());
const orphans = differences(files).filter((d) => d.startsWith('orphan '));
if (orphans.length) throw new Error(`Remove obsolete generated files explicitly: ${orphans.join(', ')}`);
mkdirSync(output, { recursive: true });
for (const [name, content] of Object.entries(files)) writeFileSync(join(output, name), content);
console.log(`[contract generation] wrote ${Object.keys(files).length} files`);
