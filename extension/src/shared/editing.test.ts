import { describe, expect, it } from 'vitest';
import { isSamePiece, movePiece, placePiece } from './editing';
import { emptyBoard, startingPosition, type Piece } from './position';

const whiteKnight: Piece = { color: 'w', type: 'n' };
const blackQueen: Piece = { color: 'b', type: 'q' };

describe('placePiece', () => {
  it('places a piece on an empty square', () => {
    expect(placePiece(emptyBoard(), 'e4', whiteKnight)).toEqual({ e4: whiteKnight });
  });

  it('replaces an existing piece', () => {
    expect(placePiece({ e4: whiteKnight }, 'e4', blackQueen)).toEqual({ e4: blackQueen });
  });

  it('removes a piece with null, leaving no empty key behind', () => {
    const board = placePiece({ e4: whiteKnight, d5: blackQueen }, 'e4', null);
    expect(board).toEqual({ d5: blackQueen });
    expect(Object.keys(board)).toEqual(['d5']);
  });

  it('does not mutate the input', () => {
    const board = { e4: whiteKnight };
    placePiece(board, 'd5', blackQueen);
    placePiece(board, 'e4', null);
    expect(board).toEqual({ e4: whiteKnight });
  });
});

describe('movePiece', () => {
  it('moves a piece to an empty square', () => {
    expect(movePiece({ g1: whiteKnight }, 'g1', 'f3')).toEqual({ f3: whiteKnight });
  });

  it('captures a piece on the target square', () => {
    expect(movePiece({ f3: whiteKnight, d4: blackQueen }, 'f3', 'd4')).toEqual({
      d4: whiteKnight,
    });
  });

  it('is a no-op when moving onto the same square or from an empty square', () => {
    const board = { f3: whiteKnight };
    expect(movePiece(board, 'f3', 'f3')).toBe(board);
    expect(movePiece(board, 'a1', 'a2')).toBe(board);
  });

  it('does not mutate the input', () => {
    const board = startingPosition().board;
    const before = { ...board };
    movePiece(board, 'e2', 'e4');
    expect(board).toEqual(before);
  });
});

describe('isSamePiece', () => {
  it('compares color and type', () => {
    expect(isSamePiece(whiteKnight, { color: 'w', type: 'n' })).toBe(true);
    expect(isSamePiece(whiteKnight, { color: 'b', type: 'n' })).toBe(false);
    expect(isSamePiece(whiteKnight, { color: 'w', type: 'b' })).toBe(false);
  });

  it('treats missing pieces as different', () => {
    expect(isSamePiece(undefined, undefined)).toBe(false);
    expect(isSamePiece(whiteKnight, undefined)).toBe(false);
  });
});
