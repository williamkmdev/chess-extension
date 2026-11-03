import { describe, expect, it } from 'vitest';
import {
  CASTLING_RIGHTS,
  FILES,
  RANKS,
  emptyBoard,
  emptyDraft,
  isSquare,
  squareFromCoords,
  squareToCoords,
  startingPosition,
  type Square,
} from './position';

describe('square helpers', () => {
  it.each([
    ['a1', 0, 0],
    ['h1', 7, 0],
    ['a8', 0, 7],
    ['h8', 7, 7],
    ['e4', 4, 3],
  ] as const)('maps %s <-> file %i, rank %i', (square, file, rank) => {
    expect(squareFromCoords(file, rank)).toBe(square);
    expect(squareToCoords(square)).toEqual({ file, rank });
  });

  it('round-trips every square', () => {
    for (const file of FILES) {
      for (const rank of RANKS) {
        const square: Square = `${file}${rank}`;
        const { file: f, rank: r } = squareToCoords(square);
        expect(squareFromCoords(f, r)).toBe(square);
      }
    }
  });

  it.each([
    [-1, 0],
    [8, 0],
    [0, -1],
    [0, 8],
    [0.5, 0],
    [Number.NaN, 0],
  ])('rejects out-of-range coordinates (%d, %d)', (file, rank) => {
    expect(() => squareFromCoords(file, rank)).toThrow(RangeError);
  });

  it('recognizes valid squares only', () => {
    expect(isSquare('a1')).toBe(true);
    expect(isSquare('h8')).toBe(true);
    for (const bad of ['', 'i1', 'a0', 'a9', 'A1', 'a10', ' a1', 'e4 ']) {
      expect(isSquare(bad)).toBe(false);
    }
  });
});

describe('emptyDraft', () => {
  it('has an empty board and an unknown side to move', () => {
    const draft = emptyDraft();
    expect(draft.board).toEqual(emptyBoard());
    expect(draft.sideToMove).toBe('unknown');
  });

  it('marks every metadata field as a default, not a fact', () => {
    const draft = emptyDraft();
    for (const right of CASTLING_RIGHTS) {
      expect(draft.castling[right]).toEqual({ value: false, source: 'default' });
    }
    expect(draft.enPassant).toEqual({ value: null, source: 'default' });
    expect(draft.halfmoveClock).toEqual({ value: 0, source: 'default' });
    expect(draft.fullmoveNumber).toEqual({ value: 1, source: 'default' });
  });

  it('lets one castling right be stated while the others stay defaults', () => {
    const draft = emptyDraft();
    const castling = {
      ...draft.castling,
      whiteKingside: { value: true, source: 'provided' as const },
    };
    expect(castling.whiteKingside).toEqual({ value: true, source: 'provided' });
    expect(castling.whiteQueenside).toEqual({ value: false, source: 'default' });
    expect(castling.blackKingside).toEqual({ value: false, source: 'default' });
    expect(castling.blackQueenside).toEqual({ value: false, source: 'default' });
  });

  it('returns independent objects', () => {
    expect(emptyDraft().board).not.toBe(emptyDraft().board);
  });
});

describe('startingPosition', () => {
  const start = startingPosition();

  it('has 32 pieces in the standard setup', () => {
    expect(Object.keys(start.board)).toHaveLength(32);
    expect(start.board.e1).toEqual({ color: 'w', type: 'k' });
    expect(start.board.d1).toEqual({ color: 'w', type: 'q' });
    expect(start.board.a1).toEqual({ color: 'w', type: 'r' });
    expect(start.board.g8).toEqual({ color: 'b', type: 'n' });
    expect(start.board.e8).toEqual({ color: 'b', type: 'k' });
    expect(start.board.d8).toEqual({ color: 'b', type: 'q' });
    for (const file of FILES) {
      expect(start.board[`${file}2`]).toEqual({ color: 'w', type: 'p' });
      expect(start.board[`${file}7`]).toEqual({ color: 'b', type: 'p' });
      for (const rank of ['3', '4', '5', '6'] as const) {
        expect(start.board[`${file}${rank}`]).toBeUndefined();
      }
    }
  });

  it('has fully known metadata', () => {
    expect(start.sideToMove).toBe('w');
    for (const right of CASTLING_RIGHTS) {
      expect(start.castling[right]).toEqual({ value: true, source: 'provided' });
    }
    for (const field of [start.enPassant, start.halfmoveClock, start.fullmoveNumber]) {
      expect(field.source).toBe('provided');
    }
    expect(start.enPassant.value).toBeNull();
    expect(start.halfmoveClock.value).toBe(0);
    expect(start.fullmoveNumber.value).toBe(1);
  });
});
