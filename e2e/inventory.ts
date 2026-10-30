import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

export const repo = fileURLToPath(new URL('../', import.meta.url));
export function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}
export function counted(label: string, count: number): void {
  console.log(`[e2e ${label}] walked ${count}`);
  if (count === 0) throw new Error(`${label}: refused empty inventory`);
}

/** Read the actual chamber declaration; never maintain a second ID list. */
export function chamberIds(text: string): string[] {
  const ids: string[] = [];
  const ast = ts.createSourceFile('shell.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function visit(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'chambers' && node.initializer) {
      function properties(child: ts.Node): void {
        if (ts.isPropertyAssignment(child) && child.name.getText(ast) === 'id' && ts.isStringLiteral(child.initializer)) {
          ids.push(child.initializer.text);
        }
        ts.forEachChild(child, properties);
      }
      properties(node.initializer);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  counted('chamber IDs', ids.length);
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate chamber IDs');
  return ids;
}

/** Discover literal/template candidates, then ask the real canonicalizer. */
export function routeInventory(navigation: string, ids: readonly string[]): string[] {
  counted('route input IDs', ids.length);
  const ast = ts.createSourceFile('navigation.ts', navigation, ts.ScriptTarget.Latest, true);
  const declaration = ast.statements.find((node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && node.name?.text === 'canonicalHash');
  if (!declaration?.body) throw new Error('canonicalHash declaration missing');
  const candidates = new Set<string>();
  function visit(node: ts.Node): void {
    if (ts.isStringLiteralLike(node) && node.text.startsWith('#/')) candidates.add(node.text);
    if (ts.isTemplateExpression(node) && node.head.text.startsWith('#/')) {
      if (node.templateSpans.length !== 1 || node.templateSpans[0]?.expression.getText(ast) !== 'id') {
        throw new Error('New route template needs an inventory adapter');
      }
      for (const id of ids) candidates.add(`${node.head.text}${id}${node.templateSpans[0].literal.text}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(declaration.body);
  counted('route candidates', candidates.size);
  const javascript = ts.transpile(declaration.getText(ast).replace(/^export\s+/, ''), { target: ts.ScriptTarget.ES2024 });
  const canonical: unknown = runInNewContext(`${javascript}\ncanonicalHash`, { chambers: ids.map(id => ({ id })) }, { timeout: 1000 });
  if (typeof canonical !== 'function') throw new Error('canonicalHash is not callable');
  const routes = [...new Set([...candidates].map(candidate => {
    const value: unknown = canonical(candidate);
    if (typeof value !== 'string' || !value.startsWith('#/')) throw new Error('Invalid canonical route');
    return value;
  }))].sort();
  counted('canonical routes', routes.length);
  return routes;
}

export function tokenInventory(css: string): string[] {
  const tokens = [...new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map(match => match[1]).filter((name): name is string => !!name))];
  counted('CSS token declarations', tokens.length);
  return tokens;
}

export const routes = routeInventory(source('apps/desktop/src/navigation.ts'), chamberIds(source('packages/ui/src/shell.tsx')));
export const tokens = tokenInventory(source('packages/tokens/src/generated.css'));
export const themes = ['paper', 'stock'] as const;
export const stewardStates = ['resting', 'open'] as const;
export const slug = (text: string): string => text.replace(/^#\//, '').replace(/[^a-z0-9-]+/gi, '-').replace(/-$/, '');
