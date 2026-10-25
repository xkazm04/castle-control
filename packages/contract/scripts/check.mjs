// Port of Shadowrunr OS packages/contract/scripts/check.mjs @ 7e4b6f8; Apache-2.0, NOTICE.
import { artifacts, differences, exportSchema } from './codegen.mjs';
const defects = differences(artifacts(exportSchema()));
if (defects.length) throw new Error(`Contract drift: ${defects.join(', ')}. Run pnpm -C packages/contract generate`);
