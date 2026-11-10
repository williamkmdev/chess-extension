// The piece model's contract, and turning its output into a draft position.
//
// The model (chess_tiles.onnx, kept out of the repository) reads float32 tiles
// [N, 1, 32, 32], grayscale bytes / 255, and outputs softmax probabilities [N, 13] over
// LABELS. See docs/vision/recognition.md.

import { displayRows } from '../shared/layout';
import {
  emptyDraft,
  type Color,
  type DraftPosition,
  type Piece,
  type Square,
} from '../shared/position';
import type { BoardRect, RgbaImage } from './locate';
import { boardTiles, TILE_SIZE } from './tiles';

/** The model's classes, in output order: empty, then White's and Black's pieces as in FEN. */
export const LABELS = '1KQRBNPkqrbnp';
export const CLASS_COUNT = LABELS.length;

/** Runs the model: `count` tiles in, `count × CLASS_COUNT` probabilities out. */
export type Classifier = (input: Float32Array, count: number) => Promise<Float32Array>;

/** What the model read on one tile. */
export interface TileReading {
  /** The likeliest class: a piece, or null for an empty square. */
  readonly piece: Piece | null;
  /** Its probability. Softmax confidence, not a guarantee of correctness. */
  readonly confidence: number;
}

/** The model's input for `tiles` (grayscale bytes, from `boardTiles`): bytes / 255. */
export function toInput(tiles: Uint8Array): Float32Array {
  const input = new Float32Array(tiles.length);
  for (let i = 0; i < tiles.length; i += 1) input[i] = (tiles[i] ?? 0) / 255;
  return input;
}

/** The number of tiles in `tiles`. */
export function tileCount(tiles: Uint8Array): number {
  return tiles.length / (TILE_SIZE * TILE_SIZE);
}

function pieceFromLabel(label: string): Piece | null {
  if (label === '1') return null;
  const lower = label.toLowerCase();
  return {
    color: label === lower ? 'b' : 'w',
    type: lower as Piece['type'],
  };
}

/** The likeliest class of each tile, in the order the tiles were given. */
export function readTiles(probs: Float32Array): TileReading[] {
  if (probs.length % CLASS_COUNT !== 0) {
    throw new Error(`Expected ${String(CLASS_COUNT)} probabilities per tile.`);
  }
  const readings: TileReading[] = [];
  for (let start = 0; start < probs.length; start += CLASS_COUNT) {
    let best = 0;
    for (let k = 1; k < CLASS_COUNT; k += 1) {
      if ((probs[start + k] ?? 0) > (probs[start + best] ?? 0)) best = k;
    }
    readings.push({
      piece: pieceFromLabel(LABELS.charAt(best)),
      confidence: probs[start + best] ?? 0,
    });
  }
  return readings;
}

/** Reads the 64 squares of the board at `rect` in `image` (the whole screenshot). */
export async function readBoard(
  image: RgbaImage,
  rect: BoardRect,
  classify: Classifier,
): Promise<TileReading[]> {
  const tiles = boardTiles(image, rect);
  const count = tileCount(tiles);
  return readTiles(await classify(toInput(tiles), count));
}

/**
 * The draft the 64 readings show, given the board's orientation on screen (the same
 * as the editor's Flip board state). Readings are in screen order, row by row from the
 * top left. Only the pieces come from the screenshot: the side to move is unknown and
 * every other field is a labeled default.
 */
export function positionFromReadings(
  readings: readonly TileReading[],
  orientation: Color,
): DraftPosition {
  if (readings.length !== 64) throw new Error('Expected a reading for each of the 64 squares.');
  const board: Partial<Record<Square, Piece>> = {};
  displayRows(orientation).forEach((row, rowIndex) => {
    row.forEach((square, column) => {
      const piece = readings[rowIndex * 8 + column]?.piece;
      if (piece) board[square] = piece;
    });
  });
  return { ...emptyDraft(), board };
}
