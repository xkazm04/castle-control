import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const ignored = new Set(['.git', 'node_modules', '.pnpm-store', 'target', 'dist', 'coverage']);
export const codeExtensions = new Set(['.rs', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.html']);

// The files git would commit from `root`: tracked plus untracked-and-not-ignored.
// Nested worktrees and locally ignored scratch trees (.claude/worktrees, .contest)
// are not part of the product, so the gates must not walk them. Returns null
// when `root` is not inside a git work tree, so callers fall back to readdir.
function gitInventory(root) {
  const run = spawnSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '.'],
    { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  );
  if (run.error || run.status !== 0) return null;
  return run.stdout.split('\0').filter(Boolean);
}

function walkGit(root, names, predicate) {
  const result = [];
  for (const name of names) {
    const path = join(root, name);
    const segments = name.split('/');
    if (segments.some((segment) => ignored.has(segment))) continue;
    // Tracked-but-deleted files and symlinks are not product code.
    let stat;
    try {
      stat = lstatSync(path);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    if (stat.isFile() && predicate(path)) result.push(path);
  }
  return result.sort();
}

export function walk(root, predicate = () => true) {
  const result = [];
  if (!existsSync(root)) return result;
  const names = gitInventory(root);
  if (names !== null) return walkGit(root, names, predicate);
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
      && !local.startsWith('.personas/') && !local.startsWith('.port/') && !local.startsWith('.hackathon/')
      && codeExtensions.has(extname(path));
  });
}

export function text(path) {
  return readFileSync(path, 'utf8');
}

export function counted(name, files) {
  console.log(`[${name}] walked ${files.length} files`);
  if (files.length === 0) throw new Error(`${name}: refused empty inventory`);
}
