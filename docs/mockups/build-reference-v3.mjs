import {copyFileSync} from 'node:fs';
copyFileSync(new URL('../../dist/index.html',import.meta.url),new URL('bedrock-reference-v3.html',import.meta.url));
console.log('Copied production build to docs/mockups/bedrock-reference-v3.html');
