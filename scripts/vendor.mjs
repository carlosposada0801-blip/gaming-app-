// Copies three.js and the game's fonts out of node_modules into www/,
// so the app runs fully offline with no CDN requests.
import { copyFileSync, mkdirSync } from 'node:fs';

const copies = [
  ['node_modules/three/build/three.min.js', 'www/vendor/three.min.js'],
  ['node_modules/@fontsource/big-shoulders-stencil-display/files/big-shoulders-stencil-display-latin-600-normal.woff2', 'www/fonts/big-shoulders-stencil-display-600.woff2'],
  ['node_modules/@fontsource/big-shoulders-stencil-display/files/big-shoulders-stencil-display-latin-800-normal.woff2', 'www/fonts/big-shoulders-stencil-display-800.woff2'],
  ['node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2', 'www/fonts/ibm-plex-mono-400.woff2'],
  ['node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff2', 'www/fonts/ibm-plex-mono-600.woff2'],
  ['node_modules/@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-400-normal.woff2', 'www/fonts/barlow-semi-condensed-400.woff2'],
  ['node_modules/@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-600-normal.woff2', 'www/fonts/barlow-semi-condensed-600.woff2'],
];

mkdirSync('www/vendor', { recursive: true });
mkdirSync('www/fonts', { recursive: true });
for (const [from, to] of copies) copyFileSync(from, to);
console.log(`Vendored ${copies.length} files into www/`);
