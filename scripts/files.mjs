import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const ignored = new Set(['.git', 'node_modules', '.pnpm-store', 'target', 'dist', 'coverage']);
export const codeExtensions = new Set(['.rs', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.html']);

export function walk(root, predicate = () => true) {
  const result = [];
  if (!existsSync(root)) return result;
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      // Never follow junctions or symlinks out of the workspace.
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory() && !ignored.has(entry.name)) visit(path);
      else if (entry.isFile() && predicate(path)) result.push(path);
    }
  }
  visit(root);
  return result.sort();
}

export function productCode(root) {
  return walk(root, (path) => {
    const local = relative(root, path).replaceAll('\\', '/');
    return !local.startsWith('prototype/') && !local.startsWith('docs/')
      && !local.startsWith('.personas/') && codeExtensions.has(extname(path));
  });
}

export function text(path) {
  return readFileSync(path, 'utf8');
}

export function counted(name, files) {
  console.log(`[${name}] walked ${files.length} files`);
  if (files.length === 0) throw new Error(`${name}: refused empty inventory`);
}
