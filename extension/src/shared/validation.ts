// Chess legality checks for a draft position, run before it can be confirmed and
// analyzed. FEN syntax is checked separately by parseFen.

import { Chess } from 'chess.js';
import {
  isDarkSquare,
  isSquare,
  type Board,
  type CastlingRight,
  type Color,
  type DraftPosition,
  type Piece,
  type PieceType,
  type Square,
} from './position';

export type PositionErrorCode =
  | 'missing-king'
  | 'too-many-kings'
  | 'pawn-on-back-rank'
  | 'too-many-pawns'
  | 'impossible-promotions'
  | 'opponent-in-check'
  | 'both-kings-in-check'
  | 'castling-without-king'
  | 'castling-without-rook'
  | 'en-passant-wrong-side'
  | 'en-passant-square-occupied'
  | 'en-passant-no-pawn'
  | 'en-passant-halfmove-clock';

export interface PositionError {
  readonly code: PositionErrorCode;
  /** What is wrong and, where possible, how to fix it. */
  readonly message: string;
  /** Squares involved, so the editor can highlight them. */
  readonly squares?: readonly Square[];
}

/**
 * Returns every legality problem found in the position; an empty list means valid.
 * Metadata sources don't matter here: a defaulted value is still the value the user
 * would be confirming. Checks that depend on the side to move are skipped or relaxed
 * while it is unknown.
 */
export function validatePosition(position: DraftPosition): readonly PositionError[] {
  const pieces = listPieces(position.board);
  return [
    ...checkKings(pieces),
    ...checkBackRankPawns(pieces),
    ...checkPieceCounts(pieces),
    ...checkChecks(pieces, position.sideToMove),
    ...checkCastling(position),
    ...checkEnPassant(position),
  ];
}

interface PlacedPiece {
  readonly square: Square;
  readonly piece: Piece;
}

const COLORS: readonly Color[] = ['w', 'b'];
const COLOR_NAME: Readonly<Record<Color, string>> = { w: 'White', b: 'Black' };
const opposite = (color: Color): Color => (color === 'w' ? 'b' : 'w');

function listPieces(board: Board): PlacedPiece[] {
  const placed: PlacedPiece[] = [];
  for (const [square, piece] of Object.entries(board)) {
    if (isSquare(square)) placed.push({ square, piece });
  }
  return placed;
}

function squaresOf(pieces: readonly PlacedPiece[], color: Color, type: PieceType): Square[] {
  return pieces
    .filter(({ piece }) => piece.color === color && piece.type === type)
    .map(({ square }) => square);
}

function checkKings(pieces: readonly PlacedPiece[]): PositionError[] {
  const errors: PositionError[] = [];
  for (const color of COLORS) {
    const kings = squaresOf(pieces, color, 'k');
    if (kings.length === 0) {
      errors.push({ code: 'missing-king', message: `${COLOR_NAME[color]} has no king.` });
    } else if (kings.length > 1) {
      errors.push({
        code: 'too-many-kings',
        message: `${COLOR_NAME[color]} has ${String(kings.length)} kings; remove all but one.`,
        squares: kings,
      });
    }
  }
  return errors;
}

function checkBackRankPawns(pieces: readonly PlacedPiece[]): PositionError[] {
  return pieces
    .filter(({ square, piece }) => piece.type === 'p' && (square[1] === '1' || square[1] === '8'))
    .map(({ square, piece }) => ({
      code: 'pawn-on-back-rank' as const,
      message: `${COLOR_NAME[piece.color]} pawn on ${square}: pawns can't stand on rank 1 or 8.`,
      squares: [square],
    }));
}

const STARTING_COUNT: Readonly<Record<'q' | 'r' | 'n', number>> = { q: 1, r: 2, n: 2 };

function checkPieceCounts(pieces: readonly PlacedPiece[]): PositionError[] {
  const errors: PositionError[] = [];
  for (const color of COLORS) {
    const name = COLOR_NAME[color];
    const pawns = squaresOf(pieces, color, 'p');
    if (pawns.length > 8) {
      errors.push({
        code: 'too-many-pawns',
        message: `${name} has ${String(pawns.length)} pawns; the most possible is 8.`,
        squares: pawns,
      });
    }

    // Every piece beyond the starting set must be a promoted pawn, and each
    // promotion uses up one of the 8 pawns. Bishops are counted per square color:
    // each side starts with one light-squared and one dark-squared bishop.
    const extra = (count: number, start: number) => Math.max(0, count - start);
    const bishops = squaresOf(pieces, color, 'b');
    const darkBishops = bishops.filter(isDarkSquare).length;
    const promoted =
      Object.entries(STARTING_COUNT).reduce(
        (sum, [type, start]) =>
          sum + extra(squaresOf(pieces, color, type as PieceType).length, start),
        0,
      ) +
      extra(darkBishops, 1) +
      extra(bishops.length - darkBishops, 1);
    const promotionsAvailable = 8 - Math.min(pawns.length, 8);
    if (promoted > promotionsAvailable) {
      errors.push({
        code: 'impossible-promotions',
        message:
          `${name} has more promoted pieces (${String(promoted)}) than missing pawns ` +
          `(${String(promotionsAvailable)}) that could have promoted.`,
      });
    }
  }
  return errors;
}

function checkChecks(
  pieces: readonly PlacedPiece[],
  sideToMove: DraftPosition['sideToMove'],
): PositionError[] {
  const whiteKings = squaresOf(pieces, 'w', 'k');
  const blackKings = squaresOf(pieces, 'b', 'k');
  const [whiteKing] = whiteKings;
  const [blackKing] = blackKings;
  // Attack detection is only meaningful with exactly one king per side; other
  // king problems are reported by checkKings.
  if (whiteKings.length !== 1 || blackKings.length !== 1 || !whiteKing || !blackKing) {
    return [];
  }
  const kingSquares: Readonly<Record<Color, Square>> = { w: whiteKing, b: blackKing };

  const chess = new Chess();
  chess.clear();
  for (const { square, piece } of pieces) {
    chess.put({ type: piece.type, color: piece.color }, square);
  }

  const attackersOf = (color: Color): Square[] =>
    chess.attackers(kingSquares[color], opposite(color));
  const inCheck = (color: Color) => attackersOf(color).length > 0;
  const checkSquares = (color: Color): Square[] => [kingSquares[color], ...attackersOf(color)];

  if (sideToMove === 'unknown') {
    if (inCheck('w') && inCheck('b')) {
      return [
        {
          code: 'both-kings-in-check',
          message: 'Both kings are in check, which is impossible in a real game.',
          squares: [...checkSquares('w'), ...checkSquares('b')],
        },
      ];
    }
    return [];
  }

  const waiting = opposite(sideToMove);
  if (inCheck(waiting)) {
    return [
      {
        code: 'opponent-in-check',
        message:
          `${COLOR_NAME[waiting]} is in check but it's ${COLOR_NAME[sideToMove]}'s turn. ` +
          `Either it's ${COLOR_NAME[waiting]} to move, or the pieces are misplaced.`,
        squares: checkSquares(waiting),
      },
    ];
  }
  return [];
}

interface CastlingRequirement {
  readonly color: Color;
  readonly side: 'kingside' | 'queenside';
  readonly king: Square;
  readonly rook: Square;
}

const CASTLING_REQUIREMENTS: Readonly<Record<CastlingRight, CastlingRequirement>> = {
  whiteKingside: { color: 'w', side: 'kingside', king: 'e1', rook: 'h1' },
  whiteQueenside: { color: 'w', side: 'queenside', king: 'e1', rook: 'a1' },
  blackKingside: { color: 'b', side: 'kingside', king: 'e8', rook: 'h8' },
  blackQueenside: { color: 'b', side: 'queenside', king: 'e8', rook: 'a8' },
};

/** Placement can disprove a castling right but never prove it. */
function checkCastling(position: DraftPosition): PositionError[] {
  const errors: PositionError[] = [];
  for (const [right, requirement] of Object.entries(CASTLING_REQUIREMENTS)) {
    if (!position.castling[right as CastlingRight].value) continue;
    const { color, side, king, rook } = requirement;
    const name = COLOR_NAME[color];
    const has = (square: Square, type: PieceType) => {
      const piece = position.board[square];
      return piece?.color === color && piece.type === type;
    };
    if (!has(king, 'k')) {
      errors.push({
        code: 'castling-without-king',
        message: `${name} can't castle ${side}: the ${name.toLowerCase()} king isn't on ${king}. Remove the castling right or move the king.`,
        squares: [king],
      });
    }
    if (!has(rook, 'r')) {
      errors.push({
        code: 'castling-without-rook',
        message: `${name} can't castle ${side}: there's no ${name.toLowerCase()} rook on ${rook}. Remove the castling right or place the rook.`,
        squares: [rook],
      });
    }
  }
  return errors;
}

/**
 * An en passant square means a pawn just moved two squares past it. A pawn able to
 * capture en passant is not required: FEN producers differ on that.
 */
function checkEnPassant(position: DraftPosition): PositionError[] {
  const target = position.enPassant.value;
  if (target === null) return [];

  const file = target[0] ?? '';
  const onRankSix = target[1] === '6';
  // Rank 6: Black just pushed from rank 7 to rank 5, so White moves next. Rank 3 mirrors it.
  const mover: Color = onRankSix ? 'b' : 'w';
  const nextToMove = opposite(mover);
  const origin = `${file}${onRankSix ? '7' : '2'}`;
  const pawnSquare = `${file}${onRankSix ? '5' : '4'}`;
  if (!isSquare(origin) || !isSquare(pawnSquare)) return [];

  const errors: PositionError[] = [];
  const moverName = COLOR_NAME[mover];
  if (position.sideToMove !== 'unknown' && position.sideToMove !== nextToMove) {
    errors.push({
      code: 'en-passant-wrong-side',
      message: `En passant square ${target} means ${moverName} just moved a pawn two squares, so it must be ${COLOR_NAME[nextToMove]} to move.`,
      squares: [target],
    });
  }

  const occupied = [target, origin].filter((square) => position.board[square]);
  if (occupied.length > 0) {
    errors.push({
      code: 'en-passant-square-occupied',
      message: `En passant square ${target} requires ${target} and ${origin} to be empty, since a pawn just passed through them.`,
      squares: occupied,
    });
  }

  const pawn = position.board[pawnSquare];
  if (pawn?.color !== mover || pawn.type !== 'p') {
    errors.push({
      code: 'en-passant-no-pawn',
      message: `En passant square ${target} requires a ${moverName.toLowerCase()} pawn on ${pawnSquare}, the pawn that just moved two squares.`,
      squares: [pawnSquare],
    });
  }

  // The last move was a pawn move, which resets the halfmove clock.
  const halfmoves = position.halfmoveClock.value;
  if (halfmoves !== 0) {
    errors.push({
      code: 'en-passant-halfmove-clock',
      message: `En passant square ${target} means the last move was a pawn move, so the halfmove clock must be 0, not ${String(halfmoves)}.`,
    });
  }
  return errors;
}
