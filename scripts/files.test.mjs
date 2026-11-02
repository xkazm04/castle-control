import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { test } from 'node:test';
import { walk } from './files.mjs';

function put(root, local, contents = 'x\n') {
  const path = join(root, local);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function git(root, ...args) {
  const run = spawnSync('git', ['-c', 'user.email=t@example.test', '-c', 'user.name=t', ...args], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr);
}

function names(root) {
  return walk(root).map((path) => relative(root, path).replaceAll('\\', '/'));
}

test('inside a git work tree the walk sees tracked and unignored files, not ignored trees', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'castle-control-files-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-q');
  put(root, '.gitignore', 'scratch/\n');
  put(root, 'src/tracked.rs');
  put(root, 'scratch/copy/big.rs');
  git(root, 'add', '.gitignore', 'src/tracked.rs');
  put(root, 'src/new-untracked.rs');
  put(root, 'node_modules/dep/index.js');
  assert.deepEqual(names(root), ['.gitignore', 'src/new-untracked.rs', 'src/tracked.rs']);
});

test('a tracked file deleted from disk is skipped, not an error', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'castle-control-files-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-q');
  put(root, 'gone.rs');
  put(root, 'kept.rs');
  git(root, 'add', '.');
  rmSync(join(root, 'gone.rs'));
  assert.deepEqual(names(root), ['kept.rs']);
});

test('outside any git work tree the walk falls back to the directory scan', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'castle-control-files-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  put(root, 'a/one.rs');
  put(root, 'target/skip.rs');
  assert.deepEqual(names(root), ['a/one.rs']);
});
