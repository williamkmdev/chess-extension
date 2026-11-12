// Draws the extension's icon: a small chessboard inside screenshot crop marks, on a
// dark rounded square. Writes public/icons/icon.svg (for the README) and the PNG sizes
// Chrome and the Web Store use. Run with `npm run icons` after changing the design.
//
// Plain shapes, rasterized here with 4×4 supersampling, so no image library is needed.

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { encodePng } from './png.ts';

type Rgb = readonly [number, number, number];

interface Shape {
  /** In units of the artwork's size (0–1). */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly radius?: number;
  readonly color: Rgb;
}

const BACKGROUND: Rgb = [0x26, 0x32, 0x2b];
const LIGHT: Rgb = [0xf0, 0xd9, 0xb5];
const DARK: Rgb = [0xb5, 0x88, 0x63];
const MARKS: Rgb = [0xff, 0xff, 0xff];

/** The design, back to front. */
function shapes(): Shape[] {
  const list: Shape[] = [{ x: 0, y: 0, width: 1, height: 1, radius: 0.2, color: BACKGROUND }];

  // A 4×4 corner of a board, a1 dark at the bottom left.
  const board = { x: 0.25, size: 0.5 };
  const cell = board.size / 4;
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      list.push({
        x: board.x + col * cell,
        y: board.x + row * cell,
        width: cell,
        height: cell,
        color: (row + col) % 2 === 0 ? LIGHT : DARK,
      });
    }
  }

  // Crop marks: an L at each corner, around the board.
  const near = 0.11;
  const far = 1 - near;
  const arm = 0.2;
  const thick = 0.075;
  for (const [cx, sx] of [
    [near, 1],
    [far, -1],
  ] as const) {
    for (const [cy, sy] of [
      [near, 1],
      [far, -1],
    ] as const) {
      const left = sx === 1 ? cx : cx - arm;
      const top = sy === 1 ? cy : cy - thick;
      list.push({ x: left, y: top, width: arm, height: thick, color: MARKS });
      const vLeft = sx === 1 ? cx : cx - thick;
      const vTop = sy === 1 ? cy : cy - arm;
      list.push({ x: vLeft, y: vTop, width: thick, height: arm, color: MARKS });
    }
  }
  return list;
}

function inside(shape: Shape, x: number, y: number): boolean {
  const { x: left, y: top, width, height, radius = 0 } = shape;
  if (x < left || y < top || x >= left + width || y >= top + height) return false;
  if (radius === 0) return true;
  // Distance past the nearest corner circle's centre, if in a corner.
  const dx = Math.max(left + radius - x, 0, x - (left + width - radius));
  const dy = Math.max(top + radius - y, 0, y - (top + height - radius));
  return dx * dx + dy * dy <= radius * radius;
}

/**
 * RGBA pixels of the icon at `size` px, with the artwork inset by `padding` px on each
 * side (transparent), as the Web Store asks of the 128 px icon.
 */
function render(size: number, padding: number): Uint8Array {
  const pixels = new Uint8Array(size * size * 4);
  const art = size - 2 * padding;
  const list = shapes();
  const SAMPLES = 4;
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const x = (px + (sx + 0.5) / SAMPLES - padding) / art;
          const y = (py + (sy + 0.5) / SAMPLES - padding) / art;
          let top: Shape | undefined;
          for (const shape of list) if (inside(shape, x, y)) top = shape;
          if (!top) continue;
          r += top.color[0];
          g += top.color[1];
          b += top.color[2];
          a += 1;
        }
      }
      const offset = (py * size + px) * 4;
      if (a > 0) {
        pixels[offset] = Math.round(r / a);
        pixels[offset + 1] = Math.round(g / a);
        pixels[offset + 2] = Math.round(b / a);
        pixels[offset + 3] = Math.round((a / (SAMPLES * SAMPLES)) * 255);
      }
    }
  }
  return pixels;
}

function svg(): string {
  const hex = (color: Rgb) => `#${color.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  const n = (value: number) => String(Math.round(value * 128 * 1000) / 1000);
  const body = shapes()
    .map(
      (s) =>
        `  <rect x="${n(s.x)}" y="${n(s.y)}" width="${n(s.width)}" height="${n(s.height)}"` +
        `${s.radius ? ` rx="${n(s.radius)}"` : ''} fill="${hex(s.color)}"/>`,
    )
    .join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">\n${body}\n</svg>\n`;
}

const out = fileURLToPath(new URL('../public/icons/', import.meta.url));
mkdirSync(out, { recursive: true });
// Toolbar sizes are full-bleed; the store's 128 px icon keeps 16 px of padding a side.
for (const [size, padding] of [
  [16, 0],
  [32, 0],
  [48, 0],
  [128, 16],
] as const) {
  writeFileSync(
    `${out}icon${String(size)}.png`,
    encodePng({ width: size, height: size, data: new Uint8ClampedArray(render(size, padding)) }),
  );
}
writeFileSync(`${out}icon.svg`, svg());
console.log(`Icons written to ${out}`);
