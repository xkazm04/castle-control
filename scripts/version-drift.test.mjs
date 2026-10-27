import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkVersionDrift } from './version-drift.mjs';

function fixture(t, changes = {}) {
  const root = mkdtempSync(join(tmpdir(), 'castle-control-version-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const files = {
    'Cargo.toml': '[workspace.package]\nversion = "0.1.0"\n[workspace.dependencies]\nexample = { version = "9.9.9" }\n',
    'package.json': '{"version":"0.1.0"}',
    'apps/desktop/package.json': '{"version":"0.1.0"}',
    'packages/proof/package.json': '{"version":"0.1.0"}',
    'crates/explicit/Cargo.toml': '[package]\nversion = "0.1.0"\n[dependencies]\nversion = "9.9.9"\n',
    'crates/inherited/Cargo.toml': '[package]\nversion.workspace = true\n',
    'apps/desktop/src-tauri/Cargo.toml': '[package]\nversion.workspace = true\n',
    'apps/desktop/src-tauri/tauri.conf.json': '{"version":"0.1.0"}',
    ...changes,
  };
  for (const [local, contents] of Object.entries(files)) {
    if (contents === undefined) continue;
    const path = join(root, local);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  }
  return root;
}

test('matching explicit and inherited versions pass; dependency versions are irrelevant', (t) => {
  const result = checkVersionDrift(fixture(t));
  assert.equal(result.version, '0.1.0');
  assert.equal(result.files.length, 8);
});

test('red once: bumped package.json fails, restored package passes', (t) => {
  const root = fixture(t, { 'packages/proof/package.json': '{"version":"0.2.0"}' });
  assert.throws(() => checkVersionDrift(root), (error) => {
    assert.match(error.message, /Version drift:\npackages\/proof\/package.json: expected 0.1.0, found 0.2.0/);
    console.log(`[version proof] RED: ${error.message}`);
    return true;
  });
  writeFileSync(join(root, 'packages/proof/package.json'), '{"version":"0.1.0"}');
  assert.equal(checkVersionDrift(root).version, '0.1.0');
  console.log('[version proof] GREEN: restored fixture matches 0.1.0');
});

test('standalone CLI exits 1 on drift and 0 after restoring the fixture', (t) => {
  const root = fixture(t, { 'packages/proof/package.json': '{"version":"0.2.0"}' });
  const script = fileURLToPath(new URL('./version-drift.mjs', import.meta.url));
  const invoke = () => {
    const result = spawnSync(process.execPath, [script], { cwd: root, stdio: 'inherit' });
    if (result.error) throw result.error;
    return result.status;
  };
  assert.equal(invoke(), 1);
  console.log('[version proof] standalone RED exit 1');
  writeFileSync(join(root, 'packages/proof/package.json'), '{"version":"0.1.0"}');
  assert.equal(invoke(), 0);
  console.log('[version proof] standalone GREEN exit 0');
});

test('reports every drifted manifest, including desktop Cargo and Tauri configuration', (t) => {
  const changed = ['package.json', 'apps/desktop/package.json', 'packages/proof/package.json',
    'crates/explicit/Cargo.toml', 'apps/desktop/src-tauri/Cargo.toml', 'apps/desktop/src-tauri/tauri.conf.json'];
  const changes = Object.fromEntries(changed.map((local) => [local,
    local.endsWith('Cargo.toml') ? '[package]\nversion = "0.2.0"\n' : '{"version":"0.2.0"}']));
  assert.throws(() => checkVersionDrift(fixture(t, changes)), (error) => {
    for (const local of changed) assert.ok(error.message.includes(`${local}: expected 0.1.0, found 0.2.0`));
    return true;
  });
});

test('a root version bump requires explicit manifests to follow', (t) => {
  const root = fixture(t, { 'Cargo.toml': '[workspace.package]\nversion = "1.2.3-rc.1"\n' });
  assert.throws(() => checkVersionDrift(root), /expected 1.2.3-rc.1, found 0.1.0/);
});

test('inline inheritance and single quoted versions are accepted', (t) => {
  const root = fixture(t, {
    'crates/inherited/Cargo.toml': '[package]\nversion = { workspace = true } # inherited\n',
    'crates/explicit/Cargo.toml': "[package]\nversion = '0.1.0' # explicit\n",
  });
  assert.equal(checkVersionDrift(root).files.length, 8);
});

test('missing versions and malformed manifests cannot silently pass', (t) => {
  const root = fixture(t, {
    'packages/proof/package.json': '{}',
    'apps/desktop/package.json': '{',
    'crates/explicit/Cargo.toml': '[package]\nname = "simulated"\n',
  });
  assert.throws(() => checkVersionDrift(root), (error) => {
    for (const local of ['packages/proof/package.json', 'apps/desktop/package.json', 'crates/explicit/Cargo.toml']) {
      assert.ok(error.message.includes(local));
    }
    assert.match(error.message, /missing version/);
    return true;
  });
});

test('missing required desktop configuration fails', (t) => {
  const root = fixture(t, { 'apps/desktop/src-tauri/tauri.conf.json': undefined });
  assert.throws(() => checkVersionDrift(root), /Version inventory missing regular files: apps\/desktop\/src-tauri\/tauri.conf.json/);
});

test('empty inventory is refused', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'castle-control-version-empty-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.throws(() => checkVersionDrift(root), /version drift: refused empty inventory/);
});

test('desktop configuration enables only unsigned NSIS bundling', () => {
  const path = new URL('../apps/desktop/src-tauri/tauri.conf.json', import.meta.url);
  const config = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(config.bundle.active, true);
  assert.deepEqual(config.bundle.targets, ['nsis']);
  assert.equal(config.bundle.windows?.certificateThumbprint, undefined);
  assert.equal(config.bundle.windows?.signCommand, undefined);
  assert.equal(config.bundle.createUpdaterArtifacts, undefined);
});
