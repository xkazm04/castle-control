import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { text } from './files.mjs';

export function boundaries(files, root) {
  const scripts = files.filter((path) => /\.[cm]?[jt]sx?$/.test(path));
  const graph = new Map();
  const defects = [];
  const packages = new Map();
  function owner(file) {
    let directory = dirname(file);
    while (directory.startsWith(root)) {
      if (existsSync(join(directory, 'package.json'))) return directory;
      if (directory === root) break;
      directory = dirname(directory);
    }
    return root;
  }
  for (const file of scripts) {
    const directory = owner(file);
    packages.set(directory, ts.parseConfigFileTextToJson(join(directory, 'package.json'), text(join(directory, 'package.json'))).config);
  }
  for (const file of scripts) {
    const source = ts.createSourceFile(file, text(file), ts.ScriptTarget.Latest, true);
    const here = owner(file);
    const edges = [];
    graph.set(file, edges);
    function inspect(specifier) {
      const name = specifier.text;
      if (name.startsWith('.')) {
        const target = resolve(dirname(file), name);
        const candidates = [target, target.replace(/\.js$/, '.ts'), target.replace(/\.jsx$/, '.tsx'),
          ...['.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.tsx', '/index.js'].map((suffix) => target + suffix)];
        const resolved = candidates.find((candidate) => existsSync(candidate));
        if (!resolved) defects.push(`${file}: unresolved relative import ${name}`);
        else {
          if (owner(resolved) !== here) defects.push(`${file}: cross-package relative import ${name}`);
          edges.push(resolved);
        }
      } else {
        for (const [directory, metadata] of packages) {
          if (name !== metadata.name && !name.startsWith(`${metadata.name}/`)) continue;
          if (directory === root) continue;
          if (name !== metadata.name) defects.push(`${file}: workspace deep import ${name}`);
          if (relative(root, directory).startsWith('apps') && here !== directory) defects.push(`${file}: cannot import an app`);
          if (here !== directory && !{ ...packages.get(here).dependencies, ...packages.get(here).devDependencies }[metadata.name]) {
            defects.push(`${file}: undeclared workspace dependency ${name}`);
          }
          // Package-level edges catch cycles across each package's public entry.
          edges.push(directory);
          graph.set(here, [...(graph.get(here) ?? []), directory]);
        }
      }
    }
    function visit(node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier
          && ts.isStringLiteralLike(node.moduleSpecifier)) inspect(node.moduleSpecifier);
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
          || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
          && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) inspect(node.arguments[0]);
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  const active = new Set();
  const done = new Set();
  function visit(node) {
    if (active.has(node)) { defects.push(`import cycle: ${node}`); return; }
    if (done.has(node)) return;
    active.add(node);
    for (const edge of graph.get(node) ?? []) visit(edge);
    active.delete(node);
    done.add(node);
  }
  for (const file of graph.keys()) visit(file);
  return defects;
}
