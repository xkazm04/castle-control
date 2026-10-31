/** Client-local pattern preview only. Rust remains the authority for real rules.
 * Admit a conservative common subset; never silently approximate another syntax.
 * In particular Rust's Unicode shorthands/classes/boundaries differ from JS.
 */
export type PatternRefusal = 'unsupported_by_gate' | 'invalid';
type Refused = { ok: false; refusal: PatternRefusal; matches: false };
type Compiled = { ok: true; matches: (text: string) => boolean } | Refused;
const refuse = (refusal: PatternRefusal): Refused => ({ ok: false, refusal, matches: false });
export const patternSizeCap = 500;

function variants(text: string): string[] {
  const normalized = text.toLowerCase().replace(/\u200b|\u200c|\u200d|\ufeff/gu, '').replace(/[‘’]/gu, "'");
  const points = [...normalized];
  function destretch(keep: number): string {
    let out = '';
    for (let index = 0; index < points.length;) {
      const point = points[index] ?? '';
      let end = index + 1;
      while (points[end] === point) end++;
      const length = end - index;
      out += point.repeat(length >= 3 ? keep : length); index = end;
    }
    return out;
  }
  return [text, destretch(1), destretch(2), normalized];
}

export function compilePreviewPattern(pattern: string): Compiled {
  if (!pattern.trim() || pattern.length > patternSizeCap || /[\uD800-\uDFFF]/u.test(pattern)) return refuse('invalid');
  let source = ''; let in_class = false; let class_start = -1; let repeats = 0; let unbounded = 0;
  for (let index = 0; index < pattern.length; index++) {
    const point = pattern[index];
    if (point === undefined) return refuse('invalid');
    if (point === '\\') {
      const escape = pattern[++index];
      if (escape === undefined) return refuse('invalid');
      if (escape === 'x' || escape === 'u') {
        const rest = pattern.slice(index + 1);
        const hex = escape === 'u' && rest.startsWith('{') ? /^\{([0-9a-fA-F]{1,6})\}/.exec(rest)
          : new RegExp(`^([0-9a-fA-F]{${escape === 'x' ? 2 : 4}})`).exec(rest);
        if (!hex?.[0] || !hex[1]) return refuse('invalid');
        const code = Number.parseInt(hex[1], 16);
        if (code > 0x10ffff || code >= 0xd800 && code <= 0xdfff) return refuse('invalid');
        source += `\\u{${code.toString(16)}}`; index += hex[0].length; continue;
      }
      if (!'nrtfv\\^$.|?*+()[]{}-/'.includes(escape)) return refuse('unsupported_by_gate');
      source += `\\${escape}`; continue;
    }
    if (point === '[') {
      if (in_class) return refuse('unsupported_by_gate');
      in_class = true; class_start = index;
    } else if (point === ']') {
      if (!in_class || index === class_start + 1 || pattern.slice(class_start, index) === '[^') return refuse('invalid');
      in_class = false;
    } else if (in_class && ['&&', '--', '~~'].some(operator => pattern.startsWith(operator, index))) {
      return refuse('unsupported_by_gate');
    } else if (!in_class) {
      if (point === '(' && pattern[index + 1] === '?' && pattern[index + 2] !== ':') return refuse('unsupported_by_gate');
      // Quantified groups and multiple open repetitions invite JS backtracking;
      // core can accept them, but this synchronous preview declines them.
      if ('*+?{'.includes(point) && !(point === '?' && pattern[index - 1] === '(')) {
        if (pattern[index - 1] === ')' || ++repeats > 4) return refuse('unsupported_by_gate');
        if ('*+'.includes(point) && ++unbounded > 1) return refuse('unsupported_by_gate');
        if (point === '{') {
          const repeat = /^\{([0-9]+)(?:,([0-9]*))?\}/.exec(pattern.slice(index));
          if (!repeat) return refuse('invalid');
          if (Number(repeat[1]) > 64 || Number(repeat[2]) > 64 || repeat[2] === '' && ++unbounded > 1) return refuse('unsupported_by_gate');
          source += repeat[0]; index += repeat[0].length - 1; continue;
        }
      }
      // Rust dot excludes LF only; Rust $ requires the absolute end of input.
      if (point === '.') { source += '[^\n]'; continue; }
      if (point === '$') { source += '(?![\\s\\S])'; continue; }
    }
    source += point;
  }
  if (in_class) return refuse('invalid');
  try {
    const expression = new RegExp(source, 'iu');
    return { ok: true, matches: text => variants(text).some(value => expression.test(value)) };
  } catch { return refuse('invalid'); }
}

export function previewPattern(pattern: string, text: string): { ok: true; matches: boolean } | Refused {
  const compiled = compilePreviewPattern(pattern);
  return compiled.ok ? { ok: true, matches: compiled.matches(text) } : compiled;
}
