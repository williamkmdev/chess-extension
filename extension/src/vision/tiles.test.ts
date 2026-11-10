import { describe, expect, it } from 'vitest';
import type { RgbaImage } from './locate';
import { BOARD_SIZE, boardTiles, TILE_SIZE, tileGray } from './tiles';

/** An image whose pixel (x, y) has the color `color(x, y)`. */
function image(
  width: number,
  height: number,
  color: (x: number, y: number) => readonly [number, number, number],
): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      data.set([...color(x, y), 255], offset);
    }
  }
  return { width, height, data };
}

const gray = (value: number) => [value, value, value] as const;

/** The byte at (x, y) of the resized board, from tiles in screen order. */
function boardPixel(tiles: Uint8Array, x: number, y: number) {
  const tile = Math.floor(y / TILE_SIZE) * 8 + Math.floor(x / TILE_SIZE);
  return tiles[tile * TILE_SIZE * TILE_SIZE + (y % TILE_SIZE) * TILE_SIZE + (x % TILE_SIZE)];
}

describe('tileGray', () => {
  it('weights red, green and blue as the model expects', () => {
    // 0.299·100 + 0.587·150 + 0.114·200 = 140.75, in float32.
    expect(tileGray(new Uint8ClampedArray([100, 150, 200, 255]), 0)).toBeCloseTo(140.75, 4);
    expect(tileGray(new Uint8ClampedArray([255, 255, 255, 255]), 0)).toBeCloseTo(255, 4);
  });
});

describe('boardTiles', () => {
  it('gives 64 tiles of 32×32', () => {
    const tiles = boardTiles(
      image(256, 256, () => gray(0)),
      { x: 0, y: 0, width: 256, height: 256 },
    );
    expect(tiles).toHaveLength(64 * TILE_SIZE * TILE_SIZE);
    expect(BOARD_SIZE).toBe(256);
  });

  it('keeps the pixels of a 256 px board, cut into tiles in screen order', () => {
    const source = image(300, 280, (x, y) => gray((x * 7 + y * 3) % 256));
    const tiles = boardTiles(source, { x: 20, y: 10, width: 256, height: 256 });
    for (const [x, y] of [
      [0, 0],
      [37, 35],
      [255, 0],
      [0, 255],
      [200, 130],
      [255, 255],
    ] as const) {
      expect(boardPixel(tiles, x, y)).toBe(((x + 20) * 7 + (y + 10) * 3) % 256);
    }
    // Tile 9 is the second row's second tile; its pixel (5, 3) is board pixel (37, 35).
    expect(tiles[9 * TILE_SIZE * TILE_SIZE + 3 * TILE_SIZE + 5]).toBe(
      ((37 + 20) * 7 + 45 * 3) % 256,
    );
  });

  it('samples at pixel centres between neighbours, rounding half up', () => {
    // Two pixels, black then white, stretched to 256: sample i is at (i + 0.5)/128 − 0.5.
    const tiles = boardTiles(
      image(2, 1, (x) => gray(x * 255)),
      { x: 0, y: 0, width: 2, height: 1 },
    );
    // Before the first pixel's centre: clamped to it.
    expect(boardPixel(tiles, 0, 0)).toBe(0);
    // At 0.49609375: 255 × 0.49609375 = 126.504 → 127.
    expect(boardPixel(tiles, 127, 0)).toBe(127);
    // At 0.50390625: 255 × 0.50390625 = 128.496 → 128.
    expect(boardPixel(tiles, 128, 0)).toBe(128);
    // Past the last pixel's centre: clamped to it. Every row is the same.
    expect(boardPixel(tiles, 255, 0)).toBe(255);
    expect(boardPixel(tiles, 128, 255)).toBe(128);
  });

  it('reads neighbours outside the board, up to the image edge', () => {
    // The board is pixel 1 only; pixel 2, right of it, is white.
    const tiles = boardTiles(
      image(4, 1, (x) => gray(x >= 2 ? 255 : 0)),
      { x: 1, y: 0, width: 1, height: 1 },
    );
    expect(boardPixel(tiles, 0, 0)).toBe(0);
    // At 1.498046875: 255 × 0.498046875 = 127.0 → 127.
    expect(boardPixel(tiles, 255, 0)).toBe(127);
  });

  it('rejects an empty board', () => {
    expect(() =>
      boardTiles(
        image(4, 4, () => gray(0)),
        { x: 0, y: 0, width: 0, height: 4 },
      ),
    ).toThrow();
  });
});
