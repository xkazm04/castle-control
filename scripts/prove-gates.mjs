import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const scratch = join(root, 'scripts', '.gate-proof');
if (existsSync(scratch)) throw new Error('Proof scratch directory already exists; inspect it before retrying');
mkdirSync(scratch);
const empty = join(scratch, 'empty');
mkdirSync(empty);
const evidence = [];
const contract = 'packages/contract';
const index = `${contract}/src/index.ts`;
const rust = 'crates/cc-types/src/lib.rs';
const base = 'tsconfig.base.json';
const read = (path) => readFileSync(join(root, path), 'utf8');
const expected = {
  'Rust format': 'Diff in',
  'Rust Clippy': 'identity_op',
  'Rust tests': 'seeded proof',
  'TypeScript typecheck': 'TS2322',
  'Package ESLint': '@typescript-eslint/no-unused-vars',
  'Tooling ESLint': '@typescript-eslint/no-unused-vars',
  Vitest: 'expected false to be true',
  'Import boundary': 'cross-package relative import',
  'Private workspace import': 'workspace deep import @castle-control/contract/src/generated/types',
  'Import cycle': 'import cycle:',
  'No any': 'no any',
  'No double assertion': 'no as unknown as',
  'Keymap registry': 'use the keymap registry',
  'No swallowed catch': 'no swallowed catch',
  '400-line cap': '401 lines exceeds 400',
  'Secret scan': 'prototype/proof-secret.txt: potential secret',
  'Workspace scripts': 'missing test script',
};

function proof(name, description, args, changes = {}, cwd = root) {
  const backups = new Map();
  try {
    for (const [local, contents] of Object.entries(changes)) {
      const path = join(root, local);
      const original = existsSync(path) ? readFileSync(path) : undefined;
      if (original?.equals(Buffer.from(contents))) {
        throw new Error(`${name}: ${local}: mutation did not change file contents`);
      }
      backups.set(path, original);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, contents);
    }
    // Capture to an authorized workspace file: Windows headless sandboxes may
    // reject anonymous child-process pipes outside their filesystem grants.
    const capture = join(scratch, 'output.txt');
    const descriptor = openSync(capture, 'w');
    let result;
    try {
      result = spawnSync(process.execPath, args, { cwd, stdio: ['ignore', descriptor, descriptor] });
    } finally {
      closeSync(descriptor);
    }
    if (result.error) throw result.error;
    const output = readFileSync(capture, 'utf8').replaceAll(root, '<worktree>').replaceAll('\\', '/').trim();
    rmSync(capture);
    if (result.status === 0 || result.status === null) throw new Error(`${name}: seeded violation did not fail\n${output}`);
    const diagnostic = name.startsWith('Empty ') ? 'refused empty inventory'
      : name.startsWith('TypeScript ') && name !== 'TypeScript typecheck'
        ? `Required TypeScript option: ${name.slice('TypeScript '.length)}=true`
        : expected[name];
    if (!diagnostic || !output.includes(diagnostic)) throw new Error(`${name}: failed for the wrong reason\n${output}`);
    // Keep diagnostics but omit repeated tool stack frames from the evidence.
    const lines = output.split(/\r?\n/);
    const useful = lines.filter((line) => !/^\s+at |^Node\.js |^\s*\^$/.test(line));
    evidence.push(`### ${name}\n\nSeed: ${description}\n\nCommand: \`node ${args.join(' ')}\` (cwd: \`${cwd === root ? '.' : cwd.slice(root.length + 1)}\`)\n\nExit: ${result.status}\n\n\`\`\`text\n${useful.join('\n')}\n\`\`\`\n`);
    console.log(`[proof] ${name}: exit ${result.status}`);
  } finally {
    for (const [path, contents] of backups) {
      if (contents === undefined) rmSync(path);
      else writeFileSync(path, contents);
    }
  }
}

try {
  proof('Rust format', 'Unformatted temporary function.', ['scripts/rust-gate.mjs', 'fmt'], {
    [rust]: read(rust) + '\npub fn proof( ){ }\n',
  });
  proof('Rust Clippy', 'Identity operation on a parameter.', ['scripts/rust-gate.mjs', 'clippy'], {
    [rust]: read(rust) + '\npub fn proof(value: u8) -> u8 { value + 0 }\n',
  });
  proof('Rust tests', 'A temporary test asserts false.', ['scripts/rust-gate.mjs', 'test'], {
    [rust]: read(rust) + '\n#[cfg(test)] mod proof { #[test] fn seeded_failure() { assert!(false, "seeded proof"); } }\n',
  });
  proof('TypeScript typecheck', 'Assign a number to a string.', [resolve('scripts/package-gate.mjs'), 'typecheck'], {
    [index]: read(index) + '\nexport const proof: string = 1;\n',
  }, join(root, contract));
  for (const option of ['strict', 'noUncheckedIndexedAccess', 'exactOptionalPropertyTypes', 'verbatimModuleSyntax', 'erasableSyntaxOnly']) {
    proof(`TypeScript ${option}`, `Disable effective compiler option ${option}.`,
      [resolve('scripts/package-gate.mjs'), 'typecheck'], {
        [base]: read(base).replace(`"${option}": true`, `"${option}": false`),
      }, join(root, contract));
  }
  proof('Package ESLint', 'Unused local variable.', [resolve('scripts/package-gate.mjs'), 'lint'], {
    [index]: read(index) + '\nconst unusedProof = 1;\n',
  }, join(root, contract));
  proof('Tooling ESLint', 'Unused variable in the tooling tree.', ['scripts/tooling-lint.mjs'], {
    'scripts/proof-unused.mjs': 'const unusedProof = 1;\n',
  });
  proof('Vitest', 'Temporary test expects false to equal true.', [resolve('scripts/package-gate.mjs'), 'test'], {
    [`${contract}/src/proof.test.ts`]: "import { test, expect } from 'vitest';\ntest('seeded proof', () => { expect(false).toBe(true); });\n",
  }, join(root, contract));
  proof('Import boundary', 'A contract source imports root tooling by relative path.', ['scripts/check.mjs', 'boundaries'], {
    [index]: read(index) + "\nimport '../../../scripts/files.mjs';\n",
  });
  proof('Private workspace import', 'A contract source imports its undeclared private subpath.', ['scripts/check.mjs', 'boundaries'], {
    [index]: read(index) + "\nimport '@castle-control/contract/src/generated/types';\n",
  });
  proof('Import cycle', 'Two contract source files import one another.', ['scripts/check.mjs', 'boundaries'], {
    [`${contract}/src/proof-a.ts`]: "import './proof-b.js';\nexport {};\n",
    [`${contract}/src/proof-b.ts`]: "import './proof-a.js';\nexport {};\n",
  });
  for (const [name, contents] of [
    ['No any', 'export const proof: any = 1;'],
    ['No double assertion', 'export const proof = 1 as unknown as string;'],
    ['Keymap registry', "document.addEventListener('keydown', () => {});"],
    ['No swallowed catch', 'try { throw new Error(); } catch { /* swallowed */ }'],
  ]) {
    proof(name, contents, ['scripts/check.mjs', 'hygiene'], { [index]: read(index) + `\n${contents}\n` });
  }
  proof('400-line cap', '401 lines of comments in a temporary source file.', ['scripts/check.mjs', 'file-cap'], {
    [`${contract}/src/proof-long.ts`]: '// simulated gate proof\n'.repeat(401),
  });
  proof('Secret scan', 'Synthetic provider-token-shaped string in the reference prototype; value is redacted.', ['scripts/check.mjs', 'secrets'], {
    'prototype/proof-secret.txt': ['sk', 'proj', 'SIMULATED'.repeat(5)].join('-'),
  });
  const manifest = 'packages/tokens/package.json';
  const parsed = ts.parseConfigFileTextToJson(manifest, read(manifest));
  if (parsed.error) throw new Error(`Invalid package manifest: ${manifest}`);
  parsed.config.scripts.test = '';
  proof('Workspace scripts', 'Blank the tokens test script value.', ['scripts/workspaces.mjs'], {
    [manifest]: `${JSON.stringify(parsed.config, null, 2)}\n`,
  });
  for (const gate of ['boundaries', 'hygiene', 'file-cap', 'secrets']) {
    proof(`Empty ${gate}`, 'An empty isolated directory.', ['scripts/check.mjs', gate, empty]);
  }
  for (const gate of ['fmt', 'clippy', 'test']) {
    proof(`Empty Rust ${gate}`, 'No crates or Rust sources in isolated directory.', [resolve('scripts/rust-gate.mjs'), gate], {}, empty);
  }
  for (const gate of ['typecheck', 'lint', 'test']) {
    proof(`Empty package ${gate}`, 'No TS sources in isolated directory.', [resolve('scripts/package-gate.mjs'), gate], {}, empty);
  }
  proof('Empty test cases', 'A source file with no matching tests.', [resolve('scripts/package-gate.mjs'), 'test'], {
    'scripts/.gate-proof/empty/source.ts': 'export {};\n',
  }, empty);
  proof('Empty tooling lint', 'No tooling files in isolated directory.', [resolve('scripts/tooling-lint.mjs')], {}, empty);
  proof('Empty workspace manifests', 'No workspace manifests in isolated directory.', [resolve('scripts/workspaces.mjs')], {}, empty);
  proof('Empty workspace TypeScript', 'A manifest with scripts but no TS sources.', [resolve('scripts/workspaces.mjs')], {
    'scripts/.gate-proof/empty/packages/proof/package.json': '{"scripts":{"typecheck":"tsc","lint":"eslint","test":"vitest"}}\n',
  }, empty);
  const document = join(root, 'docs/PLAN.md');
  const marker = '<!-- generated gate proofs -->';
  const introduction = readFileSync(document, 'utf8').split(marker)[0].trimEnd();
  writeFileSync(document, `${introduction}\n\n${marker}\n\n${evidence.join('\n')}\n`);
  console.log(`[proof] recorded ${evidence.length} verified non-zero results in docs/PLAN.md`);
} finally {
  // Fixed scratch path; never remove a worktree or follow a node_modules junction.
  rmSync(scratch, { recursive: true });
}
