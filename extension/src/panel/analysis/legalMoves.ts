// Which moves can be played in a position, grouped by the square they start from.
// chess.js decides legality (pins, check, castling rights, en passant).

import { Chess } from 'chess.js';
import { toFen } from '../../shared/fen';
import { isSquare, type ConfirmedPosition, type Square } from '../../shared/position';

export type PromotionPiece = 'q' | 'r' | 'b' | 'n';
export const PROMOTION_PIECES: readonly PromotionPiece[] = ['q', 'r', 'b', 'n'];

export interface LegalTarget {
  readonly to: Square;
  /** A pawn reaching the last rank: the player must choose a piece. */
  readonly promotion: boolean;
  /** Takes a piece (including en passant). */
  readonly capture: boolean;
}

/** Squares with a movable piece of the side to move, mapped to where it can go. */
export type LegalMoves = ReadonlyMap<Square, readonly LegalTarget[]>;

export function legalMoves(position: ConfirmedPosition): LegalMoves {
  // The position was validated by confirmPosition.
  const chess = new Chess(toFen(position), { skipValidation: true });
  const moves = new Map<Square, LegalTarget[]>();
  for (const move of chess.moves({ verbose: true })) {
    const { from, to } = move;
    if (!isSquare(from) || !isSquare(to)) continue;
    const targets = moves.get(from) ?? [];
    // chess.js lists a promotion once per piece; the board needs each square once.
    if (targets.some((target) => target.to === to)) continue;
    targets.push({
      to,
      promotion: move.promotion !== undefined,
      capture: move.captured !== undefined,
    });
    moves.set(from, targets);
  }
  return moves;
}

/** The target for a move from `from` to `to`, or undefined if it isn't legal. */
export function findTarget(moves: LegalMoves, from: Square, to: Square): LegalTarget | undefined {
  return moves.get(from)?.find((target) => target.to === to);
}

/** The engine's notation for a move: "e2e4", "e7e8q". */
export function toUci(from: Square, to: Square, promotion?: PromotionPiece): string {
  return `${from}${to}${promotion ?? ''}`;
}
