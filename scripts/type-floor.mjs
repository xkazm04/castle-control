export const TYPE_FLOOR_PX = 13;
export const STAGE_TYPE_FLOOR_PX = 15;

import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { counted, text, walk } from './files.mjs';

const roots = [
  'packages/tokens/src', 'packages/ui/src', 'packages/ui/kit', 'packages/keep-art/src',
  'apps/site', 'apps/desktop/src/keep', 'apps/desktop/src/shell',
  'apps/desktop/src/overview', 'apps/desktop/src/rooms/lottery',
];

// Keep offsets and newlines intact; quoted data (including SVG URLs) is opaque.
function declarations(css) {
  const source = css.replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|\/\*[\s\S]*?\*\//g,
    (match, quoted) => quoted ?? match.replace(/[^\r\n]/g, ' '));
  const result = [];
  let start = 0;
  let property;
  let valueStart = 0;
  let quote;
  let depth = 0;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quote) {
      if (char === '\\') index++;
      else if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '(' || char === '[') depth++;
    if (char === ')' || char === ']') depth--;
    if (depth !== 0) continue;
    if (char === ':' && property === undefined) {
      const candidate = source.slice(start, index).trim();
      if (/^[\w-]+$/.test(candidate)) {
        property = candidate;
        valueStart = index + 1;
      }
    }
    if (char === ';' || char === '}' || char === '{') {
      if (property !== undefined && char !== '{') {
        const offset = start + source.slice(start, valueStart - 1).search(/\S/);
        result.push({ property, value: source.slice(valueStart, index).trim().replace(/\s*!important\s*$/i, ''),
          line: source.slice(0, offset).split('\n').length });
      }
      property = undefined;
      start = index + 1;
    }
  }
  return result;
}

function functionArgs(value, name) {
  if (!value.startsWith(`${name}(`) || !value.endsWith(')')) return [];
  const parts = [];
  let start = name.length + 1;
  let depth = 0;
  let quote;
  for (let index = start; index < value.length - 1; index++) {
    const char = value[index];
    if (quote) {
      if (char === '\\') index++;
      else if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    if (char === '(') depth++;
    if (char === ')' && --depth < 0) return [];
    if (char === ',' && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  return depth === 0 && !quote ? [...parts, value.slice(start, -1).trim()] : [];
}

function textSize(value) {
  const token = (part) => /^var\(\s*--text-[\w-]+\s*\)$/.test(part);
  if (token(value)) return true;
  const parts = functionArgs(value, 'clamp');
  return parts.length === 3 && token(parts[0]) && parts[1] !== '' && token(parts[2]);
}

function allowedSize(value) {
  if (/^inherit$/i.test(value) || textSize(value)) return true;
  const parts = functionArgs(value, 'var');
  return parts.length === 2 && /^--(?!text-)[\w-]+$/.test(parts[0]) && textSize(parts[1]);
}

// Split only at top-level spaces or slashes, preserving nested var() fallbacks.
function fontParts(value) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let quote;
  for (let index = 0; index <= value.length; index++) {
    const char = value[index];
    if (quote) {
      if (char === '\\') index++;
      else if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    if (char === '(') depth++;
    if (char === ')') depth--;
    if (depth === 0 && (char === undefined || /[\s/]/.test(char))) {
      if (index > start) parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  return parts;
}

function shorthandSize(value) {
  if (/^inherit$/i.test(value)) return value;
  const parts = fontParts(value);
  // Font style, variant, weight and keyword stretch precede the size.
  const optional = /^(?:normal|italic|oblique|small-caps|bold|bolder|lighter|ultra-condensed|extra-condensed|condensed|semi-condensed|semi-expanded|expanded|extra-expanded|ultra-expanded|\d+(?:\.\d+)?)$/i;
  let index = 0;
  while (optional.test(parts[index] ?? '')) {
    const oblique = /^oblique$/i.test(parts[index]);
    index++;
    if (oblique && /^[+-]?(?:\d*\.)?\d+(?:deg|grad|rad|turn)$/i.test(parts[index] ?? '')) index++;
  }
  return parts[index] ?? '';
}

export function fontSizeDefects(css, file) {
  return declarations(css).flatMap(({ property, value, line }) => {
    const name = property.toLowerCase();
    if (name !== 'font-size' && name !== 'font') return [];
    const size = name === 'font' ? shorthandSize(value) : value;
    return allowedSize(size) ? [] : [`${file}:${line}: font size must use a --text-* token`];
  });
}

export function tokenFloorDefects(css) {
  return declarations(css).flatMap(({ property, value }) => {
    if (!property.startsWith('--text-')) return [];
    const floor = property.startsWith('--text-stage-') ? STAGE_TYPE_FLOOR_PX : TYPE_FLOOR_PX;
    if (!/^[+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?px$/i.test(value)) return [`generated.css: ${property} must be a px value`];
    return Number.parseFloat(value) >= floor ? []
      : [`generated.css: ${property} is ${value}, below the ${floor}px floor`];
  });
}

function numericSize(node) {
  if (!node) return undefined;
  if (ts.isJsxExpression(node)) return numericSize(node.expression);
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)
      || ts.isTypeAssertionExpression(node) || ts.isSatisfiesExpression(node)) return numericSize(node.expression);
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (ts.isPrefixUnaryExpression(node) && ts.isNumericLiteral(node.operand)) {
    if (node.operator === ts.SyntaxKind.MinusToken) return -Number(node.operand.text);
    if (node.operator === ts.SyntaxKind.PlusToken) return Number(node.operand.text);
  }
  if (ts.isStringLiteralLike(node)) {
    const value = node.text.trim();
    if (/^[+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?(?:px)?$/i.test(value)) return Number.parseFloat(value);
  }
  return undefined;
}

export function scriptFontSizeDefects(code, file) {
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, kind);
  const defects = [];
  function visit(node) {
    if (ts.isPropertyAssignment(node) || ts.isJsxAttribute(node)) {
      const name = ts.isComputedPropertyName(node.name) ? node.name.expression : node.name;
      if ((ts.isIdentifier(name) || ts.isStringLiteralLike(name))
          && ['fontSize', 'font-size'].includes(name.text)) {
        const size = numericSize(node.initializer);
        if (size !== undefined && size < TYPE_FLOOR_PX) {
          const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
          defects.push(`${file}:${line + 1}: font size ${size} is below the ${TYPE_FLOOR_PX}px floor`);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return defects;
}

export function typeFloor(root) {
  const files = roots.flatMap((directory) => walk(join(root, directory), (file) => {
    const local = relative(root, file).replaceAll('\\', '/');
    return file.endsWith('.css') || (/\.tsx?$/.test(file)
      && !/(?:^|\/)(?:__tests__|tests)\//.test(local) && !/(?:^|[/.])(?:test|spec)\.tsx?$/.test(local));
  }));
  counted('type-floor', files);
  const tokens = join(root, 'packages/tokens/src/generated.css');
  return [
    ...files.flatMap((file) => {
      const local = relative(root, file).replaceAll('\\', '/');
      return file.endsWith('.css') ? fontSizeDefects(text(file), local) : scriptFontSizeDefects(text(file), local);
    }),
    ...(existsSync(tokens) ? tokenFloorDefects(text(tokens)) : ['generated.css: missing text token stylesheet']),
  ];
}
