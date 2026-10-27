// WP 0.1 failure proofs: mutate only disposable fixtures under scripts/.
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
import { closureCases } from './closure-proof-cases.mjs';

const root = resolve(import.meta.dirname, '..');
const scratch = join(root, 'scripts', '.gate-proof');
if (!scratch.startsWith(`${root}\\scripts\\`) && !scratch.startsWith(`${root}/scripts/`)) {
  throw new Error('Proof directory must be inside this worktree');
}
if (existsSync(scratch)) throw new Error('Proof directory already exists; inspect before retrying');
mkdirSync(scratch);
const results = [];
const relative = (value) => value.replaceAll(root, '<repo>').replaceAll('\\', '/');
const write = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
};
const scripts = ['rust-gate', 'package-gate', 'tooling-lint', 'tooling-test', 'workspaces', 'check', 'files', 'run', 'hygiene', 'boundaries'];
const baseConfig = ts.parseConfigFileTextToJson('tsconfig.base.json', readFileSync(join(root, 'tsconfig.base.json'), 'utf8')).config;
const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === 'path') ?? 'PATH';

function proof(name, command, diagnostic, files = {}, options = {}) {
  const fixture = join(scratch, `case-${results.length + 1}`);
  mkdirSync(fixture);
  const put = (path, value) => write(join(fixture, path), value);
  try {
    if (!options.empty) {
      put('package.json', '{"name":"simulated-proof-root","private":true,"type":"module"}\n');
      put('pnpm-workspace.yaml', 'packages: []\n');
      put('Cargo.toml', '[workspace]\nmembers = ["crates/*"]\nresolver = "3"\n');
      put('Cargo.lock', 'version = 4\n\n[[package]]\nname = "simulated-proof"\nversion = "0.1.0"\n');
      put('crates/proof/Cargo.toml', '[package]\nname = "simulated-proof"\nversion = "0.1.0"\nedition = "2024"\n');
      put('crates/proof/src/lib.rs', 'pub fn value() -> u8 {\n    1\n}\n');
      put('packages/proof/package.json', '{"name":"simulated-proof-package","type":"module","scripts":{"typecheck":"tsc","lint":"eslint","test":"vitest"}}\n');
      put('packages/proof/tsconfig.json', JSON.stringify({ ...baseConfig, include: ['src'] }));
      put('packages/proof/src/index.ts', 'export const value = 1;\n');
      for (const script of scripts) {
        const destination = join(fixture, 'scripts', `${script}.mjs`);
        mkdirSync(dirname(destination), { recursive: true });
        copyFileSync(join(root, 'scripts', `${script}.mjs`), destination);
      }
      copyFileSync(join(root, 'eslint.config.js'), join(fixture, 'eslint.config.js'));
    }
    for (const [path, contents] of Object.entries(files)) put(path, contents);
    const args = command.map((arg) => arg.replaceAll('$R', root).replaceAll('$S', fixture));
    const cwd = join(fixture, options.cwd ?? '.');
    const capture = join(scratch, 'output.txt');
    const descriptor = openSync(capture, 'w');
    let result;
    try {
      result = spawnSync(process.execPath, args, {
        cwd, stdio: ['ignore', descriptor, descriptor],
        // Fixtures have no installation. Reuse executables without touching the junction.
        env: { ...process.env, npm_config_verify_deps_before_run: 'false',
          [pathKey]: `${join(root, 'node_modules', '.bin')}${delimiter}${process.env[pathKey] ?? ''}` },
      });
    } finally {
      closeSync(descriptor);
    }
    if (result.error) throw result.error;
    const output = readFileSync(capture, 'utf8');
    rmSync(capture);
    if (!result.status || !output.includes(diagnostic)) {
      throw new Error(`${name}: expected failure containing ${diagnostic}; exit ${result.status}\n${output}`);
    }
    const lines = output.split(/\r?\n/);
    const counts = lines.filter((line) => /\] walked \d+ files/.test(line));
    const matching = lines.filter((line) => line.includes(diagnostic));
    const error = matching.find((line) => /^(?:Error:|error:|AssertionError:)/.test(line.trim())) ?? matching[0];
    results.push({ name, command: relative(`node ${args.join(' ')}`), cwd: relative(cwd),
      exit: result.status, counts: counts.map(relative), error: relative(error) });
    console.log(`[proof] ${name}: exit ${result.status}; ${counts.join('; ')}; ${relative(error)}`);
  } finally {
    // Fixed, checked descendant; never follow or remove a dependency junction.
    rmSync(fixture, { recursive: true });
  }
}

try {
  closureCases(proof, root);
  const document = join(root, 'docs', 'gate-evidence.md');
  const marker = '<!-- current red-once proofs -->';
  const introduction = existsSync(document) ? readFileSync(document, 'utf8').split(marker)[0].trimEnd() : '# Gate evidence';
  const rows = results.map((row) => `| ${row.name} | \`${row.command.replaceAll('|', '\\|')}\`<br>cwd: \`${row.cwd}\` | ${row.exit} | ${row.counts.map((line) => `\`${line}\``).join('<br>') || 'Not emitted before refusal'} | \`${row.error.replaceAll('|', '\\|')}\` |`);
  writeFileSync(document, `${introduction}\n\n${marker}\n\n| Gate / seed | Standalone command | Exit | Inventory | First relevant diagnostic |\n| --- | --- | --- | --- | --- |\n${rows.join('\n')}\n`);
  console.log(`[proof] recorded ${results.length} verified failures in docs/gate-evidence.md`);
} finally {
  rmSync(scratch, { recursive: true });
}
