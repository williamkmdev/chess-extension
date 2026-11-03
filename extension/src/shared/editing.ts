// Pure edits used by the position editor. They return new values and never mutate
// their input. Metadata set by the user is marked 'provided'.

import {
  CASTLING_HOME,
  CASTLING_RIGHTS,
  type Board,
  type CastlingRight,
  type Color,
  type DraftPosition,
  type Piece,
  type Square,
} from './position';

/** Puts `piece` on `square`, replacing anything there; `null` empties the square. */
export function placePiece(board: Board, square: Square, piece: Piece | null): Board {
  const next: Partial<Record<Square, Piece>> = { ...board };
  if (piece) {
    next[square] = piece;
  } else {
    Reflect.deleteProperty(next, square);
  }
  return next;
}

/** Moves the piece on `from` to `to`, capturing whatever was there. */
export function movePiece(board: Board, from: Square, to: Square): Board {
  const piece = board[from];
  if (!piece || from === to) return board;
  return placePiece(placePiece(board, from, null), to, piece);
}

export function isSamePiece(a: Piece | undefined, b: Piece | undefined): boolean {
  return a !== undefined && b !== undefined && a.color === b.color && a.type === b.type;
}

export function setSideToMove(draft: DraftPosition, color: Color): DraftPosition {
  return { ...draft, sideToMove: color };
}

export function setCastlingRight(
  draft: DraftPosition,
  right: CastlingRight,
  value: boolean,
): DraftPosition {
  return { ...draft, castling: { ...draft.castling, [right]: { value, source: 'provided' } } };
}

export function setEnPassant(draft: DraftPosition, square: Square | null): DraftPosition {
  return { ...draft, enPassant: { value: square, source: 'provided' } };
}

export function setHalfmoveClock(draft: DraftPosition, value: number): DraftPosition {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`Halfmove clock must be a whole number >= 0, got ${String(value)}`);
  }
  return { ...draft, halfmoveClock: { value, source: 'provided' } };
}

export function setFullmoveNumber(draft: DraftPosition, value: number): DraftPosition {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`Fullmove number must be a whole number >= 1, got ${String(value)}`);
  }
  return { ...draft, fullmoveNumber: { value, source: 'provided' } };
}

/**
 * Sets every castling right the user hasn't stated to its likeliest value: available
 * when its king and rook stand on their home squares, otherwise not. These stay
 * 'default' (labeled as assumptions) because placement can't prove a right.
 * Rights the user provided are never changed.
 */
export function withAssumedCastling(draft: DraftPosition): DraftPosition {
  let castling = draft.castling;
  for (const right of CASTLING_RIGHTS) {
    if (castling[right].source !== 'default') continue;
    const { color, king, rook } = CASTLING_HOME[right];
    const kingHome = isSamePiece(draft.board[king], { color, type: 'k' });
    const rookHome = isSamePiece(draft.board[rook], { color, type: 'r' });
    const value = kingHome && rookHome;
    if (castling[right].value !== value) {
      castling = { ...castling, [right]: { value, source: 'default' } };
    }
  }
  return castling === draft.castling ? draft : { ...draft, castling };
}
