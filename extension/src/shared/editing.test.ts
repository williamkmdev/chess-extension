import { describe, expect, it } from 'vitest';
import {
  isSamePiece,
  movePiece,
  placePiece,
  setCastlingRight,
  setEnPassant,
  setFullmoveNumber,
  setHalfmoveClock,
  setSideToMove,
  withAssumedCastling,
} from './editing';
import {
  CASTLING_RIGHTS,
  emptyBoard,
  emptyDraft,
  startingPosition,
  type DraftPosition,
  type Piece,
} from './position';

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

describe('metadata setters', () => {
  it('mark the values they set as provided', () => {
    let draft = emptyDraft();
    draft = setSideToMove(draft, 'b');
    draft = setCastlingRight(draft, 'whiteKingside', true);
    draft = setEnPassant(draft, 'e3');
    draft = setHalfmoveClock(draft, 7);
    draft = setFullmoveNumber(draft, 30);
    expect(draft.sideToMove).toBe('b');
    expect(draft.castling.whiteKingside).toEqual({ value: true, source: 'provided' });
    expect(draft.castling.whiteQueenside).toEqual({ value: false, source: 'default' });
    expect(draft.enPassant).toEqual({ value: 'e3', source: 'provided' });
    expect(draft.halfmoveClock).toEqual({ value: 7, source: 'provided' });
    expect(draft.fullmoveNumber).toEqual({ value: 30, source: 'provided' });
  });

  it('reject impossible counter values', () => {
    expect(() => setHalfmoveClock(emptyDraft(), -1)).toThrow(RangeError);
    expect(() => setHalfmoveClock(emptyDraft(), 1.5)).toThrow(RangeError);
    expect(() => setFullmoveNumber(emptyDraft(), 0)).toThrow(RangeError);
    expect(setHalfmoveClock(emptyDraft(), 0).halfmoveClock.value).toBe(0);
  });

  it('do not mutate the input', () => {
    const draft = emptyDraft();
    const snapshot = structuredClone(draft);
    setSideToMove(draft, 'w');
    setCastlingRight(draft, 'blackQueenside', true);
    setEnPassant(draft, 'd6');
    expect(draft).toEqual(snapshot);
  });
});

describe('withAssumedCastling', () => {
  const withBoard = (board: DraftPosition['board']): DraftPosition => ({ ...emptyDraft(), board });
  const rights = (draft: DraftPosition) =>
    Object.fromEntries(CASTLING_RIGHTS.map((right) => [right, draft.castling[right].value]));

  it('assumes each right available exactly when its king and rook are home', () => {
    const draft = withAssumedCastling(
      withBoard({
        e1: { color: 'w', type: 'k' },
        h1: { color: 'w', type: 'r' },
        e8: { color: 'b', type: 'k' },
        a8: { color: 'b', type: 'r' },
      }),
    );
    expect(rights(draft)).toEqual({
      whiteKingside: true,
      whiteQueenside: false,
      blackKingside: false,
      blackQueenside: true,
    });
    for (const right of CASTLING_RIGHTS) expect(draft.castling[right].source).toBe('default');
  });

  it('requires the right color and piece type', () => {
    const draft = withAssumedCastling(
      withBoard({ e1: { color: 'w', type: 'k' }, h1: { color: 'b', type: 'r' } }),
    );
    expect(draft.castling.whiteKingside.value).toBe(false);
    const queenOnCorner = withAssumedCastling(
      withBoard({ e1: { color: 'w', type: 'k' }, a1: { color: 'w', type: 'q' } }),
    );
    expect(queenOnCorner.castling.whiteQueenside.value).toBe(false);
  });

  it('follows the pieces as they move', () => {
    const home = withAssumedCastling(withBoard(startingPosition().board));
    expect(home.castling.whiteKingside.value).toBe(true);
    const kingMoved = withAssumedCastling({ ...home, board: movePiece(home.board, 'e1', 'f2') });
    expect(kingMoved.castling.whiteKingside.value).toBe(false);
    expect(kingMoved.castling.whiteQueenside.value).toBe(false);
    expect(kingMoved.castling.blackKingside.value).toBe(true);
  });

  it('never overrides rights the user provided', () => {
    const draft = setCastlingRight(withBoard(startingPosition().board), 'whiteKingside', false);
    expect(withAssumedCastling(draft).castling.whiteKingside).toEqual({
      value: false,
      source: 'provided',
    });
    const stated = setCastlingRight(withBoard({}), 'blackQueenside', true);
    expect(withAssumedCastling(stated).castling.blackQueenside.value).toBe(true);
  });

  it('returns the same draft when nothing changes', () => {
    const draft = emptyDraft();
    expect(withAssumedCastling(draft)).toBe(draft);
  });
});
