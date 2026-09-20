// Run npm run build first, then node docs/mockups/build-reference-v2.mjs.
// Only writes the standalone prototype; src/ and generated data remain unchanged.
import { readFileSync, writeFileSync } from 'node:fs';
const root = new URL('../../', import.meta.url);
let html = readFileSync(new URL('dist/index.html', root), 'utf8');
const css = readFileSync(new URL('./reference-v2.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('./reference-v2.js', import.meta.url), 'utf8');
html = html.replace('</head>', () => `<style>${css}</style></head>`);
html = html.replace('</body>', () => `<script>${js}</script></body>`);
writeFileSync(new URL('./bedrock-reference-v2.html', import.meta.url), html);
console.log('Created docs/mockups/bedrock-reference-v2.html');
