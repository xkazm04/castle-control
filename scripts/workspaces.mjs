import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { counted, text, walk } from './files.mjs';

const manifests = [];
for (const parent of ['apps', 'packages']) {
  if (!existsSync(parent)) continue;
  for (const entry of readdirSync(parent, { withFileTypes: true })) {
    const manifest = join(parent, entry.name, 'package.json');
    if (entry.isDirectory() && !entry.isSymbolicLink() && existsSync(manifest)) manifests.push(manifest);
  }
}
counted('workspace manifests', manifests);
for (const manifest of manifests) {
  const parsed = ts.parseConfigFileTextToJson(manifest, text(manifest));
  if (parsed.error) throw new Error(`Invalid package manifest: ${manifest}`);
  for (const script of ['typecheck', 'lint', 'test']) {
    if (typeof parsed.config.scripts?.[script] !== 'string' || !parsed.config.scripts[script].trim()) {
      throw new Error(`${manifest}: missing ${script} script`);
    }
  }
}
counted('workspace TypeScript', walk('packages', (path) => /\.tsx?$/.test(path))
  .concat(walk('apps', (path) => /\.tsx?$/.test(path))));
