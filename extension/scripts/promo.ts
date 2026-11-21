// Draws the Chrome Web Store's small promo tile (440 × 280): the icon, the extension's
// name and the question it answers, on the icon's dark green. Rendered with headless
// Chrome so the text uses a real font. Run with `npm run promo`.
//
// Writes docs/store/small-promo-tile.png as a 24-bit PNG without alpha, as the store asks.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderHtml } from './chrome.ts';
import { decodePng, encodePng } from './png.ts';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const OUT = here('../../docs/store/');
const WIDTH = 440;
const HEIGHT = 280;

const manifest = JSON.parse(readFileSync(here('../public/manifest.json'), 'utf8')) as {
  name: string;
};
const icon = readFileSync(here('../public/icons/icon.svg'), 'utf8');

// The name over two lines, split before its last two words ("Chess Video" /
// "Position Explorer"), so a renamed extension still lays out sensibly.
const words = manifest.name.split(' ');
const split = Math.max(1, words.length - 2);
const name = `${words.slice(0, split).join(' ')}<br>${words.slice(split).join(' ')}`;

const html = `<!doctype html>
<meta charset="utf-8">
<style>
  html, body { margin: 0; width: ${String(WIDTH)}px; height: ${String(HEIGHT)}px; }
  body {
    background: #26322b;
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 0 26px;
    box-sizing: border-box;
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  }
  .icon svg { display: block; width: 116px; height: 116px; }
  h1 {
    margin: 0 0 12px;
    color: #ffffff;
    font-size: 26px;
    line-height: 1.15;
    font-weight: 700;
    letter-spacing: -0.2px;
  }
  p { margin: 0; color: #f0d9b5; font-size: 15px; line-height: 1.4; white-space: nowrap; }
</style>
<div class="icon">${icon}</div>
<div>
  <h1>${name}</h1>
  <p>Why didn't they play this move?<br>Capture the board and find out.</p>
</div>`;

mkdirSync(OUT, { recursive: true });
const tile = decodePng(renderHtml(html, WIDTH, HEIGHT));
if (tile.width !== WIDTH || tile.height !== HEIGHT) {
  throw new Error(`Chrome rendered ${String(tile.width)} × ${String(tile.height)}.`);
}
writeFileSync(`${OUT}small-promo-tile.png`, encodePng(tile, { alpha: false }));
console.log(`Promo tile written to ${OUT}small-promo-tile.png`);
