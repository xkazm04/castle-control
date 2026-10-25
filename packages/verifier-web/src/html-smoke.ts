import { readFileSync } from 'node:fs';
import { checkFileImports, checkHtml } from './html-check.ts';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
await checkHtml(html);
await checkFileImports(html);
console.log('self_contained_html_verifies_all_five_bundled_writs_and_rejects_bad_bls: PASS');
console.log('offline_file_import_verifies_valid_writs_and_rejects_invalid_files: PASS');
