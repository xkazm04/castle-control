import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { boundaries } from './boundaries.mjs';

function workspace(t, exports, { dependency = true, specifier = 'door', target = 'packages/contract', reverse = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'castle-control-boundaries-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const files = [];
  function write(local, contents) {
    const path = join(root, local);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
    if (local.endsWith('.ts')) files.push(path);
  }
  write('package.json', JSON.stringify({ name: 'fixture-root', private: true }));
  write('packages/consumer/package.json', JSON.stringify({
    name: '@castle-control/consumer',
    exports: { './door': './src/index.ts' },
    ...(dependency ? { dependencies: { '@castle-control/contract': 'workspace:*' } } : {}),
  }));
  write(`${target}/package.json`, JSON.stringify({
    name: '@castle-control/contract',
    ...(exports === undefined ? {} : { exports }),
    ...(reverse ? { dependencies: { '@castle-control/consumer': 'workspace:*' } } : {}),
  }));
  write('packages/consumer/src/index.ts', `import '@castle-control/contract/${specifier}';\n`);
  write(`${target}/src/index.ts`, reverse ? "import '@castle-control/consumer/door';\n" : 'export {};\n');
  return boundaries(files, root);
}

test('declared exact export subpath is public', (t) => {
  assert.deepEqual(workspace(t, { './door': './src/door.ts' }), []);
});

test('conditional export subpath is public', (t) => {
  assert.deepEqual(workspace(t, { './door': { types: './src/door.ts', default: './src/door.js' } }), []);
});

test('undeclared private deep import is rejected', (t) => {
  const defects = workspace(t, { './door': './src/door.ts' }, { specifier: 'src/generated/types' });
  assert.equal(defects.length, 1);
  assert.match(defects[0], /workspace deep import @castle-control\/contract\/src\/generated\/types$/);
});

for (const [label, exports] of [
  ['no exports map', undefined],
  ['root-only string export', './src/index.ts'],
  ['root-only conditional export', { import: './src/index.ts' }],
]) {
  test(`${label} rejects subpaths`, (t) => {
    const defects = workspace(t, exports);
    assert.equal(defects.length, 1);
    assert.match(defects[0], /workspace deep import/);
  });
}

test('public subpath still requires a declared dependency', (t) => {
  const defects = workspace(t, { './door': './src/door.ts' }, { dependency: false });
  assert.equal(defects.length, 1);
  assert.match(defects[0], /undeclared workspace dependency @castle-control\/contract\/door$/);
});

test('wildcard export matches nested subpaths and a literal suffix', (t) => {
  assert.deepEqual(workspace(t, { './features/*.js': './src/*.js' }, { specifier: 'features/nested/door.js' }), []);
});

test('conditional wildcard export is public', (t) => {
  assert.deepEqual(workspace(t, { './features/*': { import: './src/*.js' } }, { specifier: 'features/door' }), []);
});

test('wildcard prefix and suffix must both match', (t) => {
  for (const specifier of ['private/door.js', 'features/door.ts', 'features/.js']) {
    assert.match(workspace(t, { './features/*.js': './src/*.js' }, { specifier })[0], /workspace deep import/);
  }
});

test('exact null export blocks a broader wildcard', (t) => {
  assert.match(workspace(t, { './*': './src/*.ts', './door': null })[0], /workspace deep import/);
});

test('more specific null pattern blocks a broader wildcard regardless of order', (t) => {
  for (const exports of [
    { './*': './src/*.ts', './private/*': null },
    { './private/*': null, './*': './src/*.ts' },
  ]) {
    assert.match(workspace(t, exports, { specifier: 'private/door' })[0], /workspace deep import/);
  }
});

test('public subpath still cannot import an app', (t) => {
  const defects = workspace(t, { './door': './src/door.ts' }, { target: 'apps/contract' });
  assert.equal(defects.length, 1);
  assert.match(defects[0], /cannot import an app$/);
});

test('public subpaths retain package-level cycle detection', (t) => {
  const defects = workspace(t, { './door': './src/door.ts' }, { reverse: true });
  assert.equal(defects.length, 1);
  assert.match(defects[0], /^import cycle:/);
});
