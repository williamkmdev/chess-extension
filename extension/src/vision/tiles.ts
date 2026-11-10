// Cuts the located board into the 64 square images the piece model reads.
//
// A port of `screenshot_tiles` in the model's training code (dataset_io.py), which the
// training data was generated with: grayscale, the board resized to 256×256 by
// half-pixel bilinear sampling, then 8×8 tiles of 32×32. The model was trained on
// exactly these pixels, so the arithmetic follows the Python step for step.

import type { BoardRect, RgbaImage } from './locate';

/** Side of one tile, in pixels. */
export const TILE_SIZE = 32;
/** Side of the resized board, in pixels. */
export const BOARD_SIZE = TILE_SIZE * 8;

// NumPy: `rgb @ np.array([.299, .587, .114], dtype=np.float32)`, all float32.
const RED = Math.fround(0.299);
const GREEN = Math.fround(0.587);
const BLUE = Math.fround(0.114);

/**
 * The model's grayscale of the pixel at `index` (its offset in the RGBA bytes), in
 * float32 as NumPy computes it. Not the locator's grayscale (Pillow's), on purpose.
 */
export function tileGray(data: Uint8ClampedArray, index: number): number {
  const red = Math.fround((data[index] ?? 0) * RED);
  const green = Math.fround((data[index + 1] ?? 0) * GREEN);
  const blue = Math.fround((data[index + 2] ?? 0) * BLUE);
  return Math.fround(Math.fround(red + green) + blue);
}

/**
 * Sample positions along one axis, in pixel-centre coordinates (pixel i's centre at i),
 * with the neighbours on either side clamped to the image and the weight of the second.
 */
function samples(start: number, length: number, limit: number) {
  const low = new Int32Array(BOARD_SIZE);
  const high = new Int32Array(BOARD_SIZE);
  const weight = new Float64Array(BOARD_SIZE);
  for (let i = 0; i < BOARD_SIZE; i += 1) {
    const position = start + ((i + 0.5) * length) / BOARD_SIZE - 0.5;
    const floor = Math.floor(position);
    low[i] = Math.min(Math.max(floor, 0), limit - 1);
    high[i] = Math.min(Math.max(floor + 1, 0), limit - 1);
    weight[i] = position - floor;
  }
  return { low, high, weight };
}

/**
 * The 64 tiles of the board at `rect` (pixel edges, in `image`'s pixels), as grayscale
 * bytes: tile by tile, each 32×32 row by row. Tiles are in **screen order**: row by row
 * from the top left, as the board appears, whatever its orientation. Samples near the
 * board's edge may read pixels outside `rect`, clamped to the image, so pass the whole
 * screenshot.
 */
export function boardTiles(image: RgbaImage, rect: BoardRect): Uint8Array {
  if (!(rect.width > 0 && rect.height > 0) || image.width <= 0 || image.height <= 0) {
    throw new Error('The board must have a positive size, inside a non-empty image.');
  }
  const columns = samples(rect.x, rect.width, image.width);
  const rows = samples(rect.y, rect.height, image.height);
  const gray = (x: number, y: number) => tileGray(image.data, (y * image.width + x) * 4);
  const tiles = new Uint8Array(BOARD_SIZE * BOARD_SIZE);

  for (let y = 0; y < BOARD_SIZE; y += 1) {
    const top = rows.low[y] ?? 0;
    const bottom = rows.high[y] ?? 0;
    const wy = rows.weight[y] ?? 0;
    const tileRow = Math.floor(y / TILE_SIZE);
    const inTileY = y % TILE_SIZE;
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      const left = columns.low[x] ?? 0;
      const right = columns.high[x] ?? 0;
      const wx = columns.weight[x] ?? 0;
      const upper = gray(left, top) * (1 - wx) + gray(right, top) * wx;
      const lower = gray(left, bottom) * (1 - wx) + gray(right, bottom) * wx;
      const value = Math.floor(upper * (1 - wy) + lower * wy + 0.5);
      const tile = tileRow * 8 + Math.floor(x / TILE_SIZE);
      const offset = tile * TILE_SIZE * TILE_SIZE + inTileY * TILE_SIZE + (x % TILE_SIZE);
      tiles[offset] = Math.min(Math.max(value, 0), 255);
    }
  }
  return tiles;
}
