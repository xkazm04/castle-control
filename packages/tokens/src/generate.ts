import { writeFileSync } from 'node:fs';
import { renderBaseStylesheet, renderMirror, renderStylesheet } from './render.ts';

writeFileSync(new URL('./generated.css', import.meta.url), renderStylesheet());
writeFileSync(new URL('./generated-base.css', import.meta.url), renderBaseStylesheet());
writeFileSync(new URL('./generated.ts', import.meta.url), renderMirror());
console.log('[token generation] walked 1 source; generated 3 files');
