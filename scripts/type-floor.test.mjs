import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fontSizeDefects, scriptFontSizeDefects, tokenFloorDefects, typeFloor, TYPE_FLOOR_PX, STAGE_TYPE_FLOOR_PX } from './type-floor.mjs';

test('type floor accepts text tokens, inheritance and a local fallback in longhands and shorthands', () => {
  for (const size of ['inherit', 'var(--text-body)', 'var( --text-stage-title )', 'var(--local, var(--text-label))']) {
    assert.deepEqual(fontSizeDefects(`.x{font-size:${size} !important}`, 'seed.css'), []);
  }
  for (const font of [
    'inherit', 'var(--text-body)/1.5 var(--font-ui)',
    'italic 700 var(--text-label)/calc(1 + .2) "A Font", serif',
    'small-caps bold condensed var(--local, var(--text-body)) / 1.3 sans-serif',
    'oblique 10deg 500 var(--text-body) serif',
  ]) assert.deepEqual(fontSizeDefects(`.x{font:${font}}`, 'seed.css'), []);
});

test('type floor rejects raw sizes, calculations, non-text variables and unsafe local fallbacks', () => {
  for (const size of [
    '12px', '1rem', '.45em', '80%', '2vw', '3cqw', '0', 'small', 'initial',
    'clamp(13px,2vw,20px)', 'calc(var(--text-body) * 2)', 'var(--space-14)',
    'var(--local)', 'var(--local, 14px)', 'var(--local, calc(var(--text-body) * 2))',
    'var(--text-body, 12px)',
  ]) {
    const diagnostic = ['seed.css:1: font size must use a --text-* token'];
    assert.deepEqual(fontSizeDefects(`.x{font-size:${size}}`, 'seed.css'), diagnostic, size);
    assert.deepEqual(fontSizeDefects(`.x{font:italic 700 ${size}/1.2 var(--font-ui)}`, 'seed.css'), diagnostic, size);
  }
  assert.equal(fontSizeDefects('.x{font-size:var(--local, var(--text-body)) 12px}', 'seed.css').length, 1);
  assert.equal(fontSizeDefects('.x{font:12px/var(--text-body) serif}', 'seed.css').length, 1);
  assert.equal(fontSizeDefects('.x{font:caption}', 'seed.css').length, 1);
});

test('type floor accepts fluid sizes with text-token bounds, including local fallbacks and nested middle expressions', () => {
  for (const middle of ['3.2vw', '11.5vh', 'calc(var(--space-16) * 2)', 'max(2vw, min(3cqw, 4vh))']) {
    const clamp = `clamp(var(--text-figure-min), ${middle}, var(--text-figure-max))`;
    for (const size of [clamp, `var(--local, ${clamp})`]) {
      assert.deepEqual(fontSizeDefects(`.x{font-size:${size}}`, 'seed.css'), []);
      assert.deepEqual(fontSizeDefects(`.x{font:800 ${size}/.9 var(--font-display)}`, 'seed.css'), []);
    }
  }
  for (const clamp of [
    'clamp(12px, 3vw, var(--text-title))', 'clamp(var(--space-12), 3vw, var(--text-title))',
    'clamp(var(--text-label), 3vw, 40px)', 'clamp(var(--text-label), 3vw, var(--space-40))',
    'clamp(var(--text-label), , var(--text-title))', 'clamp(var(--text-label), var(--text-title))',
    'clamp(var(--text-label), 2vw, 3vw, var(--text-title))',
    'clamp(var(--text-label)), 2vw, (var(--text-title))',
  ]) {
    for (const size of [clamp, `var(--local, ${clamp})`]) {
      assert.equal(fontSizeDefects(`.x{font-size:${size}}`, 'seed.css').length, 1, size);
    }
  }
});

test('TS/TSX literal floor covers SVG attributes, inline styles and art data with source locations', () => {
  for (const [code, size] of [
    ['const style = {fontSize: 12};', 12],
    ["const style = {fontSize: '12px'};", 12],
    ["const attrs = {'font-size': '12'};", 12],
    ["const attrs = {['font-size']: '12px'};", 12],
    ['const view = <text font-size="12"/>;', 12],
    ['const view = <text fontSize={12}/>;', 12],
    ['const view = <text font-size={"12px"}/>;', 12],
    ["const view = <text style={{fontSize: '12px'}}/>;", 12],
    ['const style = {fontSize: (12 as const)};', 12],
    ['const style = {fontSize: +12};', 12],
    ['const style = {fontSize: -1};', -1],
    ['const style = {fontSize: 12.5};', 12.5],
    ['const style = {fontSize: `12px`};', 12],
  ]) {
    assert.deepEqual(scriptFontSizeDefects(`// Simulated type-floor fixture.\n${code}`, 'seed.tsx'), [
      `seed.tsx:2: font size ${size} is below the 13px floor`,
    ], code);
  }
  assert.deepEqual(scriptFontSizeDefects("const art = {attrs: {'font-size': '12'}};", 'art.ts'), [
    'art.ts:1: font size 12 is below the 13px floor',
  ]);
  assert.deepEqual(scriptFontSizeDefects('const view = <text\n font-size="12"\n style={{\n fontSize: 11\n}}/>;', 'seed.tsx'), [
    'seed.tsx:2: font size 12 is below the 13px floor',
    'seed.tsx:4: font size 11 is below the 13px floor',
  ]);
});

test('TS/TSX floor accepts 13px and larger, token expressions, and ignores comments and unrelated data', () => {
  const code = `// Simulated fixture: fontSize: 1
const example = "fontSize: 2";
const unrelated = {size: 3, fontFamily: '4'};
const style = {fontSize: 13};
const token = {fontSize: 'var(--text-body)'};
const art = {attrs: {'font-size': '16'}};
const view = <svg><text fontSize="13px"/><text font-size={14}/><text style={{fontSize: size}}/></svg>;`;
  assert.deepEqual(scriptFontSizeDefects(code, 'seed.tsx'), []);
});

test('declarations ignore comments, strings and URLs while retaining source lines and nested rules', () => {
  const css = '/* font-size:1px;\nfont:2px serif */\n.x::before{content:"font-size:3px;";\n'
    + 'background:url("data:image/svg+xml;<svg style=\'font-size:4px\'></svg>");\n'
    + 'FONT-SIZE:/* simulated comment */12px}\n@media (width < 40rem){.y{font:italic\n12px/1.2 serif}}';
  assert.deepEqual(fontSizeDefects(css, 'seed.css'), [
    'seed.css:5: font size must use a --text-* token',
    'seed.css:6: font size must use a --text-* token',
  ]);
  assert.deepEqual(fontSizeDefects('.x{font-size:var(/* simulated */--text-body)}', 'seed.css'), []);
});

test('token floors include every theme block and enforce exact general and stage thresholds', () => {
  assert.equal(TYPE_FLOOR_PX, 13);
  assert.equal(STAGE_TYPE_FLOOR_PX, 15);
  assert.deepEqual(tokenFloorDefects(':root{--text-label:13px;--text-stage-title:15px;--text-aside:14.5px;--text-plus:+13px;--text-exponent:1.3e1px;}'), []);
  assert.deepEqual(tokenFloorDefects(':root{--text-label:13px;}[data-theme="stock"]{--text-label:12px;--text-stage-x:14px;}'), [
    'generated.css: --text-label is 12px, below the 13px floor',
    'generated.css: --text-stage-x is 14px, below the 15px floor',
  ]);
  assert.deepEqual(tokenFloorDefects('/* --text-fake:1px; */:root{--space-1:1px;--text-fine:13.01px;}'), []);
  assert.deepEqual(tokenFloorDefects(':root{--text-x:-1px;}'), ['generated.css: --text-x is -1px, below the 13px floor']);
  for (const value of ['.8rem', '100%', 'var(--space-14)', 'calc(13px + 1px)', '13']) {
    assert.deepEqual(tokenFloorDefects(`:root{--text-x:${value};}`), ['generated.css: --text-x must be a px value']);
  }
});

test('inventory covers exactly the owned roots, skips missing roots and build output, and refuses empty input', () => {
  const root = mkdtempSync(resolve('scripts/.gate-proof-type-floor-'));
  assert.equal(dirname(root), resolve('scripts'));
  const put = (path, value) => {
    const target = join(root, path);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, value);
  };
  try {
    assert.throws(() => typeFloor(root), /type-floor: refused empty inventory/);
    put('packages/tokens/src/generated.css', ':root{--text-body:14px;}');
    for (const directory of [
      'packages/ui/src', 'packages/ui/kit', 'packages/keep-art/src', 'apps/site',
      'apps/desktop/src/keep', 'apps/desktop/src/shell', 'apps/desktop/src/overview', 'apps/desktop/src/rooms/lottery',
    ]) put(`${directory}/seed.css`, '.x{font-size:12px}');
    put('apps/site/dist/ignored.css', '.x{font-size:1px}');
    put('apps/site/node_modules/ignored.css', '.x{font-size:1px}');
    put('apps/desktop/src/rooms/moderator/outside.css', '.x{font-size:1px}');
    for (const path of ['seed.test.ts', 'seed.spec.tsx', '__tests__/seed.tsx', 'tests/seed.ts']) {
      put(`packages/ui/src/${path}`, '// Simulated test fixture.\nconst style = {fontSize: 1};');
    }
    put('packages/keep-art/src/seed.ts', "// Simulated art data.\nconst attrs = {'font-size': '12'};");
    put('packages/ui/kit/seed.tsx', '// Simulated SVG.\nconst view = <text fontSize={12}/>;');
    const defects = typeFloor(root);
    assert.equal(defects.length, 10);
    assert.equal(defects.filter((defect) => defect.endsWith('seed.css:1: font size must use a --text-* token')).length, 8);
    assert.ok(defects.includes('packages/keep-art/src/seed.ts:2: font size 12 is below the 13px floor'));
    assert.ok(defects.includes('packages/ui/kit/seed.tsx:2: font size 12 is below the 13px floor'));
  } finally {
    // mkdtempSync returns a fresh, fixed descendant of this worktree's scripts/.
    rmSync(root, { recursive: true });
  }
});
