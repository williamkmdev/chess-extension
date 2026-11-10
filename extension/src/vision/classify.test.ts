import { describe, expect, it, vi } from 'vitest';
import {
  CLASS_COUNT,
  LABELS,
  positionFromReadings,
  readBoard,
  readTiles,
  toInput,
  type TileReading,
} from './classify';
import { TILE_SIZE } from './tiles';

/** Probabilities for tiles whose likeliest class is `classes[i]`, with `confidence`. */
function probsFor(classes: readonly number[], confidence = 0.9) {
  const probs = new Float32Array(classes.length * CLASS_COUNT).fill(
    (1 - confidence) / (CLASS_COUNT - 1),
  );
  classes.forEach((k, tile) => {
    probs[tile * CLASS_COUNT + k] = confidence;
  });
  return probs;
}

const EMPTY: TileReading = { piece: null, confidence: 0.99 };

describe('the model contract', () => {
  it('has 13 classes: empty, then White’s and Black’s pieces', () => {
    expect(LABELS).toBe('1KQRBNPkqrbnp');
    expect(CLASS_COUNT).toBe(13);
  });

  it('scales grayscale bytes to [0, 1]', () => {
    expect([...toInput(new Uint8Array([0, 255, 51]))]).toEqual([0, 1, Math.fround(51 / 255)]);
  });
});

describe('readTiles', () => {
  it('reads the likeliest class of each tile, with its probability', () => {
    const readings = readTiles(probsFor([0, 1, 7, 6, 12, 4], 0.8));
    expect(readings.map((reading) => reading.piece)).toEqual([
      null,
      { color: 'w', type: 'k' },
      { color: 'b', type: 'k' },
      { color: 'w', type: 'p' },
      { color: 'b', type: 'p' },
      { color: 'w', type: 'b' },
    ]);
    expect(readings[1]?.confidence).toBeCloseTo(0.8, 6);
  });

  it('rejects output that isn’t 13 probabilities per tile', () => {
    expect(() => readTiles(new Float32Array(14))).toThrow();
  });
});

describe('positionFromReadings', () => {
  // Top left of the screen: a white rook; bottom right: a black king.
  const readings: TileReading[] = Array.from({ length: 64 }, () => EMPTY);
  readings[0] = { piece: { color: 'w', type: 'r' }, confidence: 0.9 };
  readings[63] = { piece: { color: 'b', type: 'k' }, confidence: 0.9 };

  it('names the squares as seen with White at the bottom', () => {
    const draft = positionFromReadings(readings, 'w');
    expect(draft.board).toEqual({ a8: { color: 'w', type: 'r' }, h1: { color: 'b', type: 'k' } });
  });

  it('names the squares as seen with Black at the bottom', () => {
    const draft = positionFromReadings(readings, 'b');
    expect(draft.board).toEqual({ h1: { color: 'w', type: 'r' }, a8: { color: 'b', type: 'k' } });
  });

  it('takes only the pieces from the screenshot', () => {
    const draft = positionFromReadings(readings, 'w');
    expect(draft.sideToMove).toBe('unknown');
    expect(draft.castling.whiteKingside.source).toBe('default');
    expect(draft.enPassant).toEqual({ value: null, source: 'default' });
    expect(draft.halfmoveClock.source).toBe('default');
    expect(draft.fullmoveNumber.source).toBe('default');
  });

  it('needs all 64 squares', () => {
    expect(() => positionFromReadings(readings.slice(1), 'w')).toThrow();
  });
});

describe('readBoard', () => {
  it('passes the 64 tiles to the model, scaled, and reads its output', async () => {
    const width = 16;
    const data = new Uint8ClampedArray(width * width * 4).fill(255);
    const classify = vi.fn((_input: Float32Array, count: number) =>
      Promise.resolve(probsFor(Array.from({ length: count }, () => 0))),
    );
    const readings = await readBoard(
      { width, height: width, data },
      { x: 0, y: 0, width, height: width },
      classify,
    );
    expect(classify).toHaveBeenCalledTimes(1);
    const [input, count] = classify.mock.calls[0] ?? [];
    expect(count).toBe(64);
    expect(input).toHaveLength(64 * TILE_SIZE * TILE_SIZE);
    expect(input?.[0]).toBe(1);
    expect(readings).toHaveLength(64);
    expect(readings.every((reading) => reading.piece === null)).toBe(true);
  });
});
