import ts from 'typescript';
import { extname } from 'node:path';
import { text } from './files.mjs';

export function hygiene(files) {
  const defects = [];
  for (const file of files.filter((path) => /\.[cm]?[jt]sx?$/.test(extname(path)))) {
    const source = ts.createSourceFile(file, text(file), ts.ScriptTarget.Latest, true);
    function report(node, message) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
      defects.push(`${file}:${line + 1}: ${message}`);
    }
    function visit(node) {
      if (node.kind === ts.SyntaxKind.AnyKeyword) report(node, 'no any');
      if (ts.isAsExpression(node) && ts.isAsExpression(node.expression)
          && node.expression.type.kind === ts.SyntaxKind.UnknownKeyword) report(node, 'no as unknown as');
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
          && node.expression.name.text === 'addEventListener'
          && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])
          && node.arguments[0].text === 'keydown') report(node, 'use the keymap registry');
      if (ts.isCatchClause(node) && node.block.statements.length === 0) report(node, 'no swallowed catch');
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  return defects;
}
