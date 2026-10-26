/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { expect, it } from 'vitest';

interface Source { readonly path: string; readonly content: string }

function walk(directory: string): Source[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) return [];
    if (entry.isDirectory()) return walk(path);
    return entry.isFile() ? [{ path, content: readFileSync(path, 'utf8') }] : [];
  });
}

function callName(expression: ts.Expression): string | undefined {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  if (ts.isElementAccessExpression(expression) && ts.isStringLiteralLike(expression.argumentExpression)) {
    return expression.argumentExpression.text;
  }
  if (ts.isParenthesizedExpression(expression)) return callName(expression.expression);
  return undefined;
}

function codeString(expression: ts.Expression): boolean {
  if (ts.isStringLiteralLike(expression) || ts.isTemplateExpression(expression)) return true;
  if (ts.isParenthesizedExpression(expression)) return codeString(expression.expression);
  return ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.PlusToken
    && (codeString(expression.left) || codeString(expression.right));
}

function importPrefix(node: ts.Node): string | undefined {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isTemplateExpression(node)) return node.head.text;
  if (ts.isParenthesizedExpression(node)) return importPrefix(node.expression);
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return importPrefix(node.left);
  }
  return undefined;
}

/** Source lint, not a sandbox: direct executable forms are inspected using the TS parser. */
function assertSafeSources(files: readonly Source[]): number {
  console.info(`[renderer static scan] walked ${files.length} files`);
  if (files.length === 0) throw new Error('renderer static scan refused an empty inventory');
  const defects: string[] = [];
  for (const { path, content } of files) {
    // Inspect HTML in all source assets too; hex escape keeps this rule from matching itself.
    if (/\x3cscript\b[^>]*\bsrc\s*=/i.test(content)) defects.push(`${path}: external script tag`);
    if (!/\.[cm]?[jt]sx?$/.test(extname(path))) continue;
    const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true);
    function report(node: ts.Node, reason: string): void {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
      defects.push(`${path}:${line + 1}: ${reason}`);
    }
    function remoteImport(node: ts.Node, specifier: ts.Node | undefined): void {
      if (specifier && /^https?:/i.test(importPrefix(specifier) ?? '')) {
        report(node, 'remote import');
      }
    }
    function visit(node: ts.Node): void {
      if (ts.isNewExpression(node) && callName(node.expression) === 'Function') report(node, 'Function constructor');
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) remoteImport(node, node.moduleSpecifier);
      if (ts.isCallExpression(node)) {
        const name = callName(node.expression);
        if (name === 'eval') report(node, 'eval call');
        if (name === 'setTimeout' || name === 'setInterval') {
          const argument = node.arguments[0];
          if (argument && codeString(argument)) report(node, 'string timer');
        }
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) remoteImport(node, node.arguments[0]);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  if (defects.length) throw new Error(defects.join('\n'));
  return files.length;
}

it('statically scans every renderer source file and refuses executable or remote scripts', () => {
  const files = walk(fileURLToPath(new URL('.', import.meta.url)));
  expect(assertSafeSources(files)).toBe(files.length);
});

it('proves the scan red on in-memory violations and refuses an empty walk', () => {
  const samples = [
    ['eval /* whitespace */ ("code")', 'eval call'],
    ['globalThis.eval("code")', 'eval call'],
    ['new Function("return 1")', 'Function constructor'],
    ['setTimeout("code", 0)', 'string timer'],
    ['setInterval(`code`, 1)', 'string timer'],
    ['setTimeout("code" + suffix, 1)', 'string timer'],
    ['import x from "https://host/module.js"', 'remote import'],
    ['import "http://host/module.js"', 'remote import'],
    ['import("https://host/module.js")', 'remote import'],
    ['import(`https://host/${module_name}.js`)', 'remote import'],
    ['import("http://host/" + module_name)', 'remote import'],
    ['export * from "https://host/module.js"', 'remote import'],
    [['<scr', 'ipt src="https://host/script.js"></script>'].join(''), 'external script tag'],
  ] as const;
  for (const [content, reason] of samples) {
    expect(() => assertSafeSources([{ path: 'in-memory.ts', content }])).toThrow(reason);
  }
  expect(() => assertSafeSources([])).toThrow(/empty inventory/);
  expect(assertSafeSources([{ path: 'safe.ts', content:
    'import { x } from "./local.ts"; setTimeout(() => x(), 0); const label = "evaluation";',
  }])).toBe(1);
});
