import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { counted } from './files.mjs';

// Only inspect immediate workspace members. Never descend into build output,
// dependency stores, symlinks or junctions (including node_modules).
function members(root, directory, manifest) {
  const parent = join(root, directory);
  if (!existsSync(parent) || lstatSync(parent).isSymbolicLink()) return [];
  return readdirSync(parent, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .map((entry) => `${directory}/${entry.name}/${manifest}`)
    .filter((local) => existsSync(join(root, local)));
}

// Read the version declaration in one specific table, never a dependency's
// version. Unsupported/missing declarations fail closed rather than being skipped.
function cargoVersion(contents, section, allowInheritance = false) {
  let table;
  const declarations = [];
  for (const line of contents.split(/\r?\n/)) {
    const heading = /^\s*\[([^\]]+)\]\s*(?:#.*)?$/.exec(line);
    if (heading) table = heading[1].trim();
    else if (table === section && /^\s*version(?:\s|[.=])/.test(line)) declarations.push(line);
  }
  if (declarations.length !== 1) throw new Error(`expected one version in [${section}]`);
  const declaration = declarations[0];
  if (allowInheritance && /^\s*version\s*\.\s*workspace\s*=\s*true\s*(?:#.*)?$/.test(declaration)) {
    return { inherited: true };
  }
  if (allowInheritance && /^\s*version\s*=\s*\{\s*workspace\s*=\s*true\s*\}\s*(?:#.*)?$/.test(declaration)) {
    return { inherited: true };
  }
  const value = /^\s*version\s*=\s*(["'])([^"']+)\1\s*(?:#.*)?$/.exec(declaration)?.[2];
  if (!value) throw new Error(`unsupported version in [${section}]`);
  return { value };
}

export function checkVersionDrift(root = process.cwd()) {
  const required = ['Cargo.toml', 'package.json', 'apps/desktop/src-tauri/Cargo.toml',
    'apps/desktop/src-tauri/tauri.conf.json'];
  const inventory = [...new Set([...required, ...members(root, 'apps', 'package.json'),
    ...members(root, 'packages', 'package.json'), ...members(root, 'crates', 'Cargo.toml')])].sort();
  const walked = inventory.filter((local) => {
    const path = join(root, local);
    return existsSync(path) && lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink();
  });
  counted('version drift', walked);
  const missing = inventory.filter((local) => !walked.includes(local));
  if (missing.length) throw new Error(`Version inventory missing regular files: ${missing.join(', ')}`);
  const read = (local) => readFileSync(join(root, local), 'utf8');
  const version = cargoVersion(read('Cargo.toml'), 'workspace.package').value;
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error('Cargo.toml: [workspace.package] version must be a semantic version');
  }
  const defects = [];
  for (const local of inventory.filter((local) => local !== 'Cargo.toml')) {
    try {
      const actual = local.endsWith('Cargo.toml')
        ? cargoVersion(read(local), 'package', true)
        : { value: JSON.parse(read(local)).version };
      if (!actual.inherited && actual.value !== version) {
        defects.push(`${local}: expected ${version}, found ${actual.value === undefined ? 'missing version' : String(actual.value)}`);
      }
    } catch (error) {
      defects.push(`${local}: ${error.message}`);
    }
  }
  if (defects.length) throw new Error(`Version drift:\n${defects.join('\n')}`);
  console.log(`[version drift] all manifests match Cargo.toml [workspace.package] version ${version}`);
  return { version, files: walked };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    checkVersionDrift(process.argv[2] === undefined ? process.cwd() : resolve(process.argv[2]));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
