// Core position types shared by the editor, FEN import/export, and the engine.
// Pure data and helpers only: no Chrome or DOM APIs.

export type Color = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export interface Piece {
  readonly color: Color;
  readonly type: PieceType;
}

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
export const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;

export type File = (typeof FILES)[number];
export type Rank = (typeof RANKS)[number];
export type Square = `${File}${Rank}`;

/** Piece placement keyed by square; empty squares are absent. */
export type Board = Readonly<Partial<Record<Square, Piece>>>;

/**
 * A metadata value plus where it came from. `'default'` means nobody has stated it
 * (e.g. a fresh setup or a screenshot), so the UI must label it as an assumption.
 * `'provided'` means the user entered it or it came from an imported FEN.
 */
export interface MetadataField<T> {
  readonly value: T;
  readonly source: 'default' | 'provided';
}

export const CASTLING_RIGHTS = [
  'whiteKingside',
  'whiteQueenside',
  'blackKingside',
  'blackQueenside',
] as const;

export type CastlingRight = (typeof CASTLING_RIGHTS)[number];

/**
 * Each right is tracked separately, so the user can state one right (e.g. "White
 * can still castle kingside") while the others remain labeled defaults.
 */
export type CastlingRights = Readonly<Record<CastlingRight, MetadataField<boolean>>>;

export interface CastlingHome {
  readonly color: Color;
  readonly side: 'kingside' | 'queenside';
  /** Where the king must stand for this right to be possible. */
  readonly king: Square;
  /** Where the rook must stand for this right to be possible. */
  readonly rook: Square;
}

export const CASTLING_HOME: Readonly<Record<CastlingRight, CastlingHome>> = {
  whiteKingside: { color: 'w', side: 'kingside', king: 'e1', rook: 'h1' },
  whiteQueenside: { color: 'w', side: 'queenside', king: 'e1', rook: 'a1' },
  blackKingside: { color: 'b', side: 'kingside', king: 'e8', rook: 'h8' },
  blackQueenside: { color: 'b', side: 'queenside', king: 'e8', rook: 'a8' },
};

/**
 * An editable, possibly incomplete or illegal position. Side to move has no sensible
 * default, so it stays `'unknown'` until stated. A draft must be confirmed before it
 * can be exported as FEN or analyzed.
 * Board orientation is UI state and deliberately not part of this type.
 */
export interface DraftPosition {
  readonly board: Board;
  readonly sideToMove: Color | 'unknown';
  readonly castling: CastlingRights;
  readonly enPassant: MetadataField<Square | null>;
  readonly halfmoveClock: MetadataField<number>;
  readonly fullmoveNumber: MetadataField<number>;
}

declare const confirmedBrand: unique symbol;

/**
 * A draft the user has confirmed: side to move is known and the position passed
 * validation. The brand exists only in the type system, so the only way to obtain one
 * is `confirmPosition`; FEN export and engine analysis accept nothing else.
 * Metadata sources are kept, so defaults the user accepted can still be labeled.
 */
export type ConfirmedPosition = DraftPosition & {
  readonly sideToMove: Color;
  readonly [confirmedBrand]: true;
};

/** All four castling rights set to the same value and source. */
export function uniformCastling(
  value: boolean,
  source: MetadataField<boolean>['source'],
): CastlingRights {
  const field = { value, source };
  return {
    whiteKingside: field,
    whiteQueenside: field,
    blackKingside: field,
    blackQueenside: field,
  };
}

/** Zero-based file (a = 0) and rank (1 = 0) indices. */
export interface SquareCoords {
  readonly file: number;
  readonly rank: number;
}

export function isSquare(value: string): value is Square {
  return /^[a-h][1-8]$/.test(value);
}

export function squareFromCoords(file: number, rank: number): Square {
  const fileName = FILES[file];
  const rankName = RANKS[rank];
  if (!Number.isInteger(file) || !Number.isInteger(rank) || !fileName || !rankName) {
    throw new RangeError(
      `Square coordinates out of range: file ${String(file)}, rank ${String(rank)}`,
    );
  }
  return `${fileName}${rankName}`;
}

export function squareToCoords(square: Square): SquareCoords {
  return {
    file: FILES.indexOf(square[0] as File),
    rank: RANKS.indexOf(square[1] as Rank),
  };
}

/** a1 is a dark square; squares alternate color along files and ranks. */
export function isDarkSquare(square: Square): boolean {
  const { file, rank } = squareToCoords(square);
  return (file + rank) % 2 === 0;
}

export function emptyBoard(): Board {
  return {};
}

/** A blank draft: empty board, unknown side to move, every other field defaulted. */
export function emptyDraft(): DraftPosition {
  return {
    board: emptyBoard(),
    sideToMove: 'unknown',
    castling: uniformCastling(false, 'default'),
    enPassant: { value: null, source: 'default' },
    halfmoveClock: { value: 0, source: 'default' },
    fullmoveNumber: { value: 1, source: 'default' },
  };
}

const BACK_RANK: readonly PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];

/** The standard starting position. Every field is known, so all are `'provided'`. */
export function startingPosition(): DraftPosition {
  const board: Partial<Record<Square, Piece>> = {};
  BACK_RANK.forEach((type, file) => {
    board[squareFromCoords(file, 0)] = { color: 'w', type };
    board[squareFromCoords(file, 1)] = { color: 'w', type: 'p' };
    board[squareFromCoords(file, 6)] = { color: 'b', type: 'p' };
    board[squareFromCoords(file, 7)] = { color: 'b', type };
  });
  return {
    board,
    sideToMove: 'w',
    castling: uniformCastling(true, 'provided'),
    enPassant: { value: null, source: 'provided' },
    halfmoveClock: { value: 0, source: 'provided' },
    fullmoveNumber: { value: 1, source: 'provided' },
  };
}
