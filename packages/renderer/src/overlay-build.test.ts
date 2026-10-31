/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import ts from 'typescript';
// @ts-expect-error Build configuration is native JavaScript, outside the TS product tree.
import { overlayInputs } from '../vite-overlay.config.mjs';

it('ships a local bundle rebuilt from this renderer and the lazy contract door', () => {
  const hash = createHash('sha256');
  for (const path of overlayInputs as readonly string[]) hash.update(readFileSync(new URL(path, new URL('../vite-overlay.config.mjs', import.meta.url)), 'utf8').replaceAll('\r\n', '\n'));
  const bundle = readFileSync(new URL('../../../apps/overlay/bundle.js', import.meta.url), 'utf8');
  expect(bundle).toContain(`Castle Control overlay source SHA-256: ${hash.digest('hex')}`);
  expect(bundle).toContain('beacons.render.snapshot');
  expect(bundle).toContain('cc-cast');
  expect(bundle).toContain('lots');
  expect(bundle).toContain('cc-lots-played:');
  const tokens = readFileSync(new URL('../../tokens/src/generated.css', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('./overlay.css', import.meta.url), 'utf8');
  // Inspect the static CSS literal without executing any bundle code.
  const embedded: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isPropertyAccessExpression(node.left) && node.left.name.text === 'textContent'
      && ts.isStringLiteralLike(node.right)) embedded.push(node.right.text);
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile('bundle.js', bundle, ts.ScriptTarget.Latest, true));
  expect(embedded).toContain((tokens + '\n' + styles).replaceAll('\r\n', '\n'));
  expect(bundle).not.toMatch(/\beval\s*\(|new\s+Function\s*\(|\bimport\s*\(/);
  const shell = readFileSync(new URL('../../../apps/overlay/index.html', import.meta.url), 'utf8');
  expect(shell).toContain('src="/bundle.js"');
  expect(shell.match(/\x3cscript\b/g)).toHaveLength(1);
  expect(shell).toMatch(/\x3cscript type="module" src="\/bundle.js"><\/script>/);
  expect(shell).not.toContain('http:');
  expect(shell).not.toContain('https:');
  // Critical geometry must exist before the module (and its embedded tokens) loads.
  expect(shell).toContain('overflow: hidden');
  expect(shell).toContain('width: 100%; height: 100%');
  expect(shell).toContain('background: transparent');
});
