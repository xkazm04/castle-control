import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { counted } from './files.mjs';

const path = new URL('../.github/workflows/ci.yml', import.meta.url);
const workflow = readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
counted('CI shape', [path]);

// The workflow uses two-space YAML indentation; scope assertions to each job.
function job(name) {
  const marker = `  ${name}:\n`;
  assert.ok(workflow.includes(marker), `Missing CI job: ${name}`);
  const body = workflow.slice(workflow.indexOf(marker) + marker.length);
  const next = body.search(/^ {2}[\w-]+:/m);
  return next === -1 ? body : body.slice(0, next);
}

function steps(body) {
  return body.split(/^ {6}- /m).slice(1).map((step) => step.trimEnd());
}

const setup = [
  'uses: actions/checkout@v4',
  'uses: pnpm/action-setup@v4',
  'uses: actions/setup-node@v4\n        with:\n          node-version: 24.14.0\n          cache: pnpm',
  'name: Install Rust toolchain\n        run: rustup show',
  'run: pnpm install --frozen-lockfile',
];

test('gates retains its original blocking Windows steps in order', () => {
  const gates = job('gates');
  assert.match(gates, /^ {4}runs-on: windows-latest$/m);
  assert.doesNotMatch(gates, /continue-on-error:|if:/);
  assert.deepEqual(steps(gates).filter((step) => !step.startsWith('uses: actions/cache@v4')),
    [...setup, 'run: pnpm gate']);
});

test('Cargo cache precedes the gate and hashes both lockfile and toolchain', () => {
  const gateSteps = steps(job('gates'));
  const cache = gateSteps.find((step) => step.startsWith('uses: actions/cache@v4'));
  assert.ok(cache, 'Missing actions/cache@v4 step');
  assert.equal(gateSteps.filter((step) => step.startsWith('uses: actions/cache@v4')).length, 1);
  assert.equal(gateSteps.indexOf(cache), gateSteps.indexOf('run: pnpm gate') - 1);
  for (const directory of ['~/.cargo/registry', '~/.cargo/git', 'target']) {
    assert.ok(cache.includes(`            ${directory}\n`), `Missing cache path: ${directory}`);
  }
  const key = cache.match(/^ {10}key: (.+)$/m)?.[1];
  assert.ok(key, 'Missing cache key');
  assert.match(key, /\$\{\{ runner\.os \}\}/);
  assert.match(key, /hashFiles\('Cargo.lock', 'rust-toolchain.toml'\)/);
});

test('lanes waits for gates, stays advisory, and runs proofs before system-Chrome e2e', () => {
  const lanes = job('lanes');
  assert.match(lanes, /^ {4}runs-on: windows-latest$/m);
  assert.match(lanes, /^ {4}needs: gates$/m);
  assert.match(lanes, /^ {4}continue-on-error: true$/m);
  assert.match(lanes, /^ {6}PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1'$/m);
  const laneSteps = steps(lanes);
  assert.deepEqual(laneSteps.slice(0, setup.length), setup);
  assert.equal(laneSteps[setup.length], steps(job('gates')).find((step) => step.startsWith('uses: actions/cache@v4')));
  assert.deepEqual(laneSteps.slice(setup.length + 1, -1), ['run: pnpm gate:proofs', 'run: pnpm e2e']);
  const artifact = laneSteps.at(-1);
  assert.match(artifact, /^uses: actions\/upload-artifact@v4\n/);
  assert.match(artifact, /^ {8}if: failure\(\)$/m);
  assert.match(artifact, /^ {10}path: e2e\/test-results$/m);
  assert.doesNotMatch(lanes, /playwright install|continue-on-error: true\n {8}/);
  const config = readFileSync(new URL('../e2e/playwright.config.ts', import.meta.url), 'utf8');
  assert.match(config, /channel: 'chrome'/);
});
