import { resolve, relative, extname } from 'node:path';
import { counted, productCode, text, walk } from './files.mjs';
import { hygiene } from './hygiene.mjs';
import { boundaries } from './boundaries.mjs';

const root = resolve(process.argv[3] ?? '.');
const code = productCode(root);
const gates = {
  boundaries: () => boundaries(code, root),
  hygiene: () => hygiene(code),
  'file-cap': () => code.flatMap((file) => {
    const lines = text(file).replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n').length;
    return lines > 400 ? [`${relative(root, file)}: ${lines} lines exceeds 400`] : [];
  }),
  secrets: () => {
    const files = walk(root, (path) => !['.png', '.jpg', '.woff2', '.ico'].includes(extname(path)));
    counted('secrets', files);
    const patterns = [
      /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/,
      /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/,
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
      /\bAKIA[0-9A-Z]{16}\b/,
      /(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password)\s*["']?\s*[:=]\s*["'][A-Za-z0-9_+/-]{16,}["']/i,
    ];
    return files.flatMap((file) => patterns.some((pattern) => pattern.test(text(file)))
      ? [`${relative(root, file)}: potential secret (value redacted)`] : []);
  },
};
const selected = process.argv[2] ? [process.argv[2]] : Object.keys(gates);
for (const gate of selected) {
  if (!Object.hasOwn(gates, gate)) throw new Error(`Unknown gate ${gate}`);
  if (gate !== 'secrets') counted(gate, code);
  const defects = gates[gate]();
  if (defects.length) {
    console.error(defects.join('\n'));
    process.exitCode = 1;
  }
}
