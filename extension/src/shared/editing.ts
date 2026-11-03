// Pure board edits used by the position editor. They return new boards and never
// mutate their input.

import type { Board, Piece, Square } from './position';

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
