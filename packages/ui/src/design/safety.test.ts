import { readdirSync, readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, test } from 'vitest';

function forbidden(source: string): string[] {
  const file = ts.createSourceFile('design.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const defects: string[] = [];
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const expression = node.expression;
      const name = ts.isPropertyAccessExpression(expression) ? expression.name.text : expression.getText(file);
      if (['eval', 'Function', 'fetch', 'WebSocket', 'XMLHttpRequest', 'Worker'].includes(name)) defects.push(name);
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (['iframe', 'script'].includes(node.tagName.getText(file))) defects.push('executable frame');
    }
    if (ts.isJsxAttribute(node) && node.name.getText(file) === 'dangerouslySetInnerHTML') defects.push('raw markup');
    ts.forEachChild(node, visit);
  }
  visit(file);
  return defects;
}

test('design sources contain no executable frames, code evaluation or network calls', () => {
  const directory = new URL('.', import.meta.url);
  const files = readdirSync(directory).filter(name => /\.(ts|tsx)$/.test(name) && !name.includes('.test.'));
  expect(files.length).toBeGreaterThan(0);
  console.log(`[design data-only scan] walked ${files.length} files`);
  for (const name of files) expect(forbidden(readFileSync(new URL(name, directory), 'utf8')), name).toEqual([]);
});

test.each(['eval("fixture")', 'new Function("fixture")', 'fetch("fixture")',
  'new WebSocket("fixture")', '<iframe />', '<div dangerouslySetInnerHTML={{ __html: "fixture" }} />'])('data-only scan is red for %s', source => {
  expect(forbidden(source).length).toBeGreaterThan(0);
});
