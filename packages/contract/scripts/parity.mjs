import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import { parseJson } from '../src/door.mjs';
import { exportSchema, root } from './codegen.mjs';

export function exportRegistry() {
  const option = process.argv.indexOf('--registry');
  const file = option < 0 ? process.env.CC_CORE_REGISTRY : process.argv[option + 1];
  if (option >= 0 && !file) throw new Error('--registry requires a file');
  if (file) return parseJson(readFileSync(resolve(file), 'utf8').replace(/^\uFEFF/, ''));
  const result = spawnSync('cargo', ['--config', 'net.offline=false', 'run', '--quiet', '-p', 'cc-core', '--bin', 'export-registry'], {
    cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 120000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Registry export failed: ${result.stderr}`);
  return parseJson(result.stdout);
}

function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isSymbolicLink() || ['node_modules', 'target', 'dist', 'generated', 'tests'].includes(entry.name)) return [];
    const file = join(directory, entry.name);
    if (entry.isDirectory()) return walk(file);
    return /\.(rs|[cm]?[jt]sx?)$/.test(file) && !/\.(test|spec)\./.test(file) ? [file] : [];
  });
}

export function usages(project = root) {
  const files = ['crates', 'apps', 'packages'].flatMap((part) => walk(join(project, part)));
  console.log(`[contract usage] walked ${files.length} files`);
  if (!files.length) throw new Error('Refused empty usage inventory');
  const invoked = [], events = [], variants = [], defects = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    if (file.endsWith('.rs')) {
      for (const match of text.matchAll(/EventKind::([A-Za-z_][\w]*)/g)) {
        if (match[1] !== 'NAMES') variants.push(match[1]);
      }
      continue;
    }
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const aliases = new Set(['invoke']);
    function inspect(node) {
      if (ts.isImportSpecifier(node) && node.propertyName?.text === 'invoke') aliases.add(node.name.text);
      if (ts.isCallExpression(node)) {
        const name = ts.isIdentifier(node.expression) ? node.expression.text
          : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : '';
        const arg = node.arguments[aliases.has(name) ? 2 : 0];
        if (aliases.has(name)) {
          if (arg && ts.isStringLiteralLike(arg)) invoked.push(arg.text);
          else defects.push(`${file}: invoke method must be a literal for parity`);
        }
        if (['subscribeEvent', 'publishEvent', 'onEvent'].includes(name)) {
          if (arg && ts.isStringLiteralLike(arg)) events.push(arg.text);
          else defects.push(`${file}: event name must be a literal for parity`);
        }
        if (name === 'parse' && ts.isPropertyAccessExpression(node.expression)
            && node.expression.expression.getText(source) === 'JSON'
            && file !== join(root, 'packages/contract/src/door.mjs')) defects.push(`${file}: JSON parsing outside the contract door`);
      }
      ts.forEachChild(node, inspect);
    }
    inspect(source);
  }
  return { files, invoked, events, variants, defects };
}

export function methodParity(declared, registered, invoked) {
  if (!declared.length || !registered.length || !registered.every((v) => typeof v === 'string')) {
    throw new Error('Refused empty or invalid declared/registered method inventory');
  }
  console.log(`[method parity] declared ${declared.length}, registered ${registered.length}, invoked ${invoked.length}, declared-but-unregistered ${declared.filter((v) => !registered.includes(v)).length}`);
  return [...registered.filter((v) => !declared.includes(v)).map((v) => `registered but undeclared: ${v}`),
    ...invoked.filter((v) => !registered.includes(v)).map((v) => `invoked but unregistered: ${v}`)];
}

export function eventParity(declared, mirrored, used) {
  if (!declared.length || !mirrored.length) throw new Error('Refused empty event inventory');
  console.log(`[event parity] declared ${declared.length}, mirrored ${mirrored.length}, usages ${used.length}`);
  return [...mirrored.filter((v) => !declared.includes(v)).map((v) => `mirrored unknown event: ${v}`),
    ...declared.filter((v) => !mirrored.includes(v)).map((v) => `missing mirrored event: ${v}`),
    ...used.filter((v) => !declared.includes(v)).map((v) => `used unknown event: ${v}`)];
}

export function checkParity(schema, registered, project = root) {
  const usage = usages(project);
  console.log(`[method parity] walked ${usage.files.length} files`);
  const methods = methodParity(schema.methods.map((v) => v.name), registered, usage.invoked);
  const source = readFileSync(join(project, 'crates/cc-types/src/events.rs'), 'utf8');
  const variantMap = new Map([...source.matchAll(/(\w+)\s*=>\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]));
  const used = [...usage.events, ...usage.variants.map((name) => variantMap.get(name) ?? `EventKind::${name}`)];
  console.log(`[event parity] walked ${usage.files.length} files`);
  const events = eventParity(schema.event_kinds, schema.types.StreamEvent.$defs.EventKind.enum, used);
  const defects = [...usage.defects, ...methods, ...events];
  if (defects.length) throw new Error(defects.join('\n'));
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  checkParity(exportSchema(), exportRegistry());
}
