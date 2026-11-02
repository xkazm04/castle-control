import ts from 'typescript';
import { extname } from 'node:path';
import { text } from './files.mjs';

const isAssertion = (node) => ts.isAsExpression(node) || ts.isTypeAssertionExpression(node);
function unwrap(node) {
  while (ts.isParenthesizedExpression(node)) node = node.expression;
  return node;
}
// A double assertion routed through unknown or never defeats the type checker.
const isEscapeHatch = (node) => isAssertion(node)
  && [ts.SyntaxKind.UnknownKeyword, ts.SyntaxKind.NeverKeyword].includes(node.type.kind);
// A promise `.catch` handler with an empty block or a void/undefined body drops the error.
function swallows(handler) {
  if (!ts.isArrowFunction(handler) && !ts.isFunctionExpression(handler)) return false;
  const body = unwrap(handler.body);
  if (ts.isBlock(body)) return body.statements.length === 0;
  return ts.isVoidExpression(body) || (ts.isIdentifier(body) && body.text === 'undefined');
}

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
      if (isAssertion(node) && isEscapeHatch(unwrap(node.expression))) report(node, 'no as unknown as');
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
          && node.expression.name.text === 'addEventListener'
          && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])
          && node.arguments[0].text === 'keydown') report(node, 'use the keymap registry');
      if (ts.isCatchClause(node) && node.block.statements.length === 0) report(node, 'no swallowed catch');
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
          && node.expression.name.text === 'catch' && node.arguments[0]
          && swallows(node.arguments[0])) report(node, 'no swallowed catch');
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  return defects;
}
