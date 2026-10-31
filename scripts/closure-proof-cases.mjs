import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

export function closureCases(proof, root) {
  const rust = 'crates/proof/src/lib.rs';
  const source = 'packages/proof/src/index.ts';
  const pkg = (mode) => ['$S/scripts/package-gate.mjs', mode];
  const cwd = { cwd: 'packages/proof' };
  proof('Version drift: bumped package manifest', ['$R/scripts/version-drift.mjs'],
    'package.json: expected 0.1.0, found 0.2.0', {
      'Cargo.toml': '[workspace]\nmembers = ["crates/*"]\n[workspace.package]\nversion = "0.1.0"\n',
      'package.json': '{"name":"simulated-proof-root","version":"0.2.0","private":true,"type":"module"}\n',
      'packages/proof/package.json': '{"name":"simulated-proof-package","version":"0.1.0"}\n',
      'apps/desktop/src-tauri/Cargo.toml': '[package]\nname = "simulated-desktop"\nversion.workspace = true\n',
      'apps/desktop/src-tauri/tauri.conf.json': '{"version":"0.1.0"}\n',
    });
  proof('Empty version drift', ['$R/scripts/version-drift.mjs'], 'version drift: refused empty inventory',
    {}, { empty: true });
  proof('Rust format: unformatted function', ['$S/scripts/rust-gate.mjs', 'fmt'], 'Diff in', {
    [rust]: 'pub fn value( )->u8{1}\n',
  });
  proof('Rust Clippy: identity operation', ['$S/scripts/rust-gate.mjs', 'clippy'], 'this operation has no effect', {
    [rust]: 'pub fn value(x: u8) -> u8 { x + 0 }\n',
  });
  proof('Rust tests: false assertion', ['$S/scripts/rust-gate.mjs', 'test'], 'simulated seeded failure', {
    [rust]: '#[test]\nfn simulated_failure() { assert!(false, "simulated seeded failure"); }\n',
  });
  proof('Cargo fetch: stale lockfile', ['$S/scripts/rust-gate.mjs', 'fetch'], 'lock file', {
    'crates/proof/Cargo.toml': '[package]\nname = "simulated-changed"\nversion = "0.1.0"\nedition = "2024"\n',
  });
  proof('TypeScript: number assigned to string', pkg('typecheck'), 'TS2322', {
    [source]: 'export const value: string = 1;\n',
  }, cwd);
  const config = ts.parseConfigFileTextToJson('tsconfig.base.json', readFileSync(join(root, 'tsconfig.base.json'), 'utf8')).config;
  for (const option of ['strict', 'noUncheckedIndexedAccess', 'exactOptionalPropertyTypes', 'verbatimModuleSyntax', 'erasableSyntaxOnly']) {
    proof(`TypeScript ${option}: disabled`, pkg('typecheck'), `Required TypeScript option: ${option}=true`, {
      'packages/proof/tsconfig.json': JSON.stringify({ compilerOptions: { ...config.compilerOptions, [option]: false }, include: ['src'] }),
    }, cwd);
  }
  proof('Package ESLint: unused variable', pkg('lint'), '@typescript-eslint/no-unused-vars', {
    [source]: 'const unusedProof = 1;\n',
  }, cwd);
  proof('Tooling ESLint: unused variable', ['$S/scripts/tooling-lint.mjs'], '@typescript-eslint/no-unused-vars', {
    'scripts/unused.mjs': 'const unusedProof = 1;\n',
  });
  proof('Vitest: false expectation', pkg('test'), 'expected false to be true', {
    'packages/proof/src/seed.test.ts': "import { test, expect } from 'vitest';\ntest('simulated proof', () => { expect(false).toBe(true); });\n",
  }, cwd);
  proof('Import boundary: cross-package relative import', ['$S/scripts/check.mjs', 'boundaries'], 'cross-package relative import', {
    [source]: "import '../../../scripts/files.mjs';\n",
  });
  proof('Import boundary: private workspace subpath', ['$S/scripts/check.mjs', 'boundaries'], 'workspace deep import', {
    [source]: "import 'simulated-proof-package/private';\n",
  });
  proof('Import cycle: mutual imports', ['$S/scripts/check.mjs', 'boundaries'], 'import cycle:', {
    [source]: "import './other.js';\n", 'packages/proof/src/other.ts': "import './index.js';\n",
  });
  for (const [name, seed, diagnostic] of [
    ['No any', 'export const value: any = 1;', 'no any'],
    ['No double assertion', 'export const value = 1 as unknown as string;', 'no as unknown as'],
    ['No raw keydown', "document.addEventListener('keydown', () => {});", 'use the keymap registry'],
    ['No swallowed catch', 'try { throw new Error(); } catch { /* simulated */ }', 'no swallowed catch'],
  ]) proof(name, ['$S/scripts/check.mjs', 'hygiene'], diagnostic, { [source]: `${seed}\n` });
  proof('400-line cap: 401 comment lines', ['$S/scripts/check.mjs', 'file-cap'], '401 lines exceeds 400', {
    [source]: '// simulated proof\n'.repeat(401),
  });
  proof('Secrets: synthetic provider-token shape (value omitted)', ['$S/scripts/check.mjs', 'secrets'], 'potential secret (value redacted)', {
    'simulated-secret.txt': ['sk', 'proj', 'SIMULATED'.repeat(5)].join('-'),
  });
  proof('Workspace scripts: blank test script', ['$S/scripts/workspaces.mjs'], 'missing test script', {
    'packages/proof/package.json': '{"scripts":{"typecheck":"tsc","lint":"eslint","test":""}}\n',
  });
  const schemaPath = join(root, 'packages/contract/src/generated/contract.schema.json');
  const readContract = (name) => readFileSync(join(root, 'packages/contract/scripts', name), 'utf8');
  const moduleUrl = (local) => pathToFileURL(join(root, 'packages/contract', local)).href;
  const schema = ts.parseConfigFileTextToJson(schemaPath, readFileSync(schemaPath, 'utf8')).config;
  const changed = { ...schema, simulated_gate_proof: true };
  proof('Contract codegen: stale schema', ['$R/packages/contract/scripts/check.mjs', '--schema', '$S/schema.json'], 'Contract drift:', {
    'schema.json': JSON.stringify(changed),
  });
  proof('Method parity: undeclared registration', ['$R/packages/contract/scripts/parity.mjs', '--schema', schemaPath, '--registry', '$S/registry.json'], 'registered but undeclared:', {
    'registry.json': JSON.stringify(['simulated.unregistered']),
  });
  const events = { ...schema, event_kinds: [...schema.event_kinds, 'simulated.event'] };
  proof('Event parity: missing mirror', ['$R/packages/contract/scripts/parity.mjs', '--schema', '$S/schema.json', '--registry', '$S/registry.json'], 'missing mirrored event: simulated.event', {
    'schema.json': JSON.stringify(events), 'registry.json': JSON.stringify(schema.methods.map((method) => method.name)),
  });
  const outputsMatch = readContract('parity.mjs').match(/const trackedBuildOutputs = \[([^\]]*)\]/);
  const outputs = outputsMatch ? [...outputsMatch[1].matchAll(/'([^']+)'/g)].map((match) => match[1]) : [];
  if (!outputs.length) throw new Error('Contract usage proof requires the trackedBuildOutputs list');
  const outputFiles = Object.fromEntries(outputs.map((output) => [output, "export const compiled = JSON.parse('{}');\n"]));
  proof('Contract usage: source parse rejected and named build output excluded', ['$S/usage.mjs'],
    '[proof verified] source JSON.parse rejected; named build output excluded', {
      ...outputFiles,
      'apps/overlay/source.js': "export const source = JSON.parse('{}');\n",
      'usage.mjs': `import assert from 'node:assert/strict';
import { join } from 'node:path';
import { usages } from ${JSON.stringify(moduleUrl('scripts/parity.mjs'))};
const usage = usages(import.meta.dirname);
for (const output of ${JSON.stringify(outputs)}) assert(!usage.files.includes(join(import.meta.dirname, output)));
assert(usage.files.includes(join(import.meta.dirname, 'apps/overlay/source.js')));
assert.deepEqual(usage.defects, [join(import.meta.dirname, 'apps/overlay/source.js') + ': JSON parsing outside the contract door']);
console.log('[proof verified] source JSON.parse rejected; named build output excluded');
throw new Error(usage.defects[0]);
`,
    });
  proof('Contract usage: stale build output exclusion', ['$S/usage.mjs'],
    'Missing listed build output: ' + outputs.at(-1), {
      ...Object.fromEntries(outputs.slice(0, -1).map((output) => [output, outputFiles[output]])),
      'usage.mjs': `import { usages } from ${JSON.stringify(moduleUrl('scripts/parity.mjs'))};\nusages(import.meta.dirname);\n`,
    });
  proof('Tooling node tests: failing assertion', ['$S/scripts/tooling-test.mjs'], 'simulated node failure', {
    'scripts/seed.test.mjs': "import { test } from 'node:test';\ntest('simulated failure', () => { throw new Error('simulated node failure'); });\n",
  });
  const countMatch = readContract('test-codegen.mjs').match(/Object.keys\(files\).length, (\d+)/);
  if (!countMatch) throw new Error('Generator proof requires an artifact-count assertion');
  const count = Number(countMatch[1]);
  const codegenTest = readContract('test-codegen.mjs')
    .replace("'./codegen.mjs'", JSON.stringify(moduleUrl('scripts/codegen.mjs')))
    .replace("'./parity.mjs'", JSON.stringify(moduleUrl('scripts/parity.mjs')))
    .replace("'../src/door.mjs'", JSON.stringify(moduleUrl('src/door.mjs')))
    .replace(`Object.keys(files).length, ${count}`, `Object.keys(files).length, ${count + 1}`);
  proof('Generator node assertions: wrong artifact count', ['$S/generator/test-codegen.mjs'], `${count} !== ${count + 1}`, {
    'generator/test-codegen.mjs': codegenTest,
    'generator/codegen.mjs': readContract('codegen.mjs'),
    'generator/parity.mjs': readContract('parity.mjs'),
  });
  for (const gate of ['boundaries', 'hygiene', 'file-cap', 'secrets']) {
    proof(`Empty ${gate}`, ['$R/scripts/check.mjs', gate, '$S'], 'refused empty inventory', {}, { empty: true });
  }
  for (const gate of ['fetch', 'fmt', 'clippy', 'test']) {
    proof(`Empty Rust ${gate}`, ['$R/scripts/rust-gate.mjs', gate], 'refused empty inventory', {}, { empty: true });
  }
  for (const mode of ['typecheck', 'lint', 'test']) {
    proof(`Empty package ${mode}`, ['$R/scripts/package-gate.mjs', mode], 'refused empty inventory', {}, { empty: true });
  }
  proof('Empty package test cases', ['$R/scripts/package-gate.mjs', 'test'], 'pnpm test cases: refused empty inventory', {
    'source.ts': 'export {};\n',
  }, { empty: true });
  proof('Empty tooling ESLint', ['$R/scripts/tooling-lint.mjs'], 'refused empty inventory', {}, { empty: true });
  proof('Empty tooling node tests', ['$R/scripts/tooling-test.mjs'], 'refused empty inventory', {}, { empty: true });
  proof('Empty workspace manifests', ['$R/scripts/workspaces.mjs'], 'refused empty inventory', {}, { empty: true });
  proof('Empty workspace TypeScript', ['$R/scripts/workspaces.mjs'], 'workspace TypeScript: refused empty inventory', {
    'packages/proof/package.json': '{"scripts":{"typecheck":"tsc","lint":"eslint","test":"vitest"}}\n',
  }, { empty: true });
  proof('Empty contract artifacts', ['$S/empty.mjs'], 'Refused empty generated inventory', {
    'empty.mjs': `import { differences } from ${JSON.stringify(moduleUrl('scripts/codegen.mjs'))};\ndifferences({}, import.meta.dirname);\n`,
  }, { empty: true });
  proof('Empty contract usage', ['$S/empty.mjs'], 'Refused empty usage inventory', {
    'empty.mjs': `import { usages } from ${JSON.stringify(moduleUrl('scripts/parity.mjs'))};\nusages(import.meta.dirname);\n`,
  }, { empty: true });
}
