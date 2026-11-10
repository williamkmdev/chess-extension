// Parity with the Python prototype (check_all.py) on a local image set. Skipped unless
// LOCATOR_PARITY_DIR points at an export: <name>.rgba.gz (raw RGBA bytes) for each
// image, plus expected.json with the prototype's results. The images stay local; see
// docs/vision/locator.md for how to make the export.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { detectGrid, gridBounds, locateBoard, toGray } from '../src/vision/locate';

interface Expected {
  readonly width: number;
  readonly height: number;
  readonly pythonMs: number;
  readonly board: {
    readonly left: number;
    readonly right: number;
    readonly top: number;
    readonly bottom: number;
    readonly coverage: number;
  } | null;
}

const dir = process.env.LOCATOR_PARITY_DIR;
const expected: Record<string, Expected> = dir
  ? (JSON.parse(readFileSync(join(dir, 'expected.json'), 'utf8')) as Record<string, Expected>)
  : {};

describe.skipIf(!dir)('locator parity with the Python prototype', () => {
  it.each(Object.keys(expected))('%s', (name) => {
    const want = expected[name];
    if (!want || !dir) throw new Error(`No expectation for ${name}`);
    const data = new Uint8ClampedArray(gunzipSync(readFileSync(join(dir, `${name}.rgba.gz`))));
    const image = { width: want.width, height: want.height, data };

    const started = performance.now();
    const located = locateBoard(image);
    const ms = performance.now() - started;
    console.info(
      `${name}: ${located.ok ? 'found' : located.reason}, ${ms.toFixed(0)} ms (Python ${String(want.pythonMs)} ms)`,
    );

    const grid = detectGrid(toGray(image));
    expect(grid.ok).toBe(want.board !== null);
    if (grid.ok && want.board) {
      const [left, right] = gridBounds(grid.x);
      const [top, bottom] = gridBounds(grid.y);
      expect(left).toBeCloseTo(want.board.left, 6);
      expect(right).toBeCloseTo(want.board.right, 6);
      expect(top).toBeCloseTo(want.board.top, 6);
      expect(bottom).toBeCloseTo(want.board.bottom, 6);
      expect(grid.coverage).toBeCloseTo(want.board.coverage, 9);
    }
  });
});
