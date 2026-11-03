// FEN (Forsyth–Edwards Notation) import and export.
// This module checks FEN *syntax* only. Whether a position is legal (king count,
// checks, pawn ranks, castling vs placement, en passant vs side to move) is the
// job of position validation.

import {
  CASTLING_RIGHTS,
  emptyDraft,
  isSquare,
  squareFromCoords,
  type Board,
  type CastlingRight,
  type CastlingRights,
  type Color,
  type ConfirmedPosition,
  type DraftPosition,
  type Piece,
  type PieceType,
  type Square,
} from './position';

export type FenField =
  | 'fen'
  | 'placement'
  | 'sideToMove'
  | 'castling'
  | 'enPassant'
  | 'halfmoveClock'
  | 'fullmoveNumber';

export interface FenError {
  /** The FEN field the problem is in; `'fen'` for problems with the string as a whole. */
  readonly field: FenField;
  readonly message: string;
}

export type ParseFenResult =
  | { readonly ok: true; readonly position: DraftPosition }
  | { readonly ok: false; readonly errors: readonly FenError[] };

const MAX_FIELDS = 6;

const PIECE_TYPES: Readonly<Record<string, PieceType>> = {
  p: 'p',
  n: 'n',
  b: 'b',
  r: 'r',
  q: 'q',
  k: 'k',
};

const CASTLING_LETTERS: Readonly<Record<CastlingRight, string>> = {
  whiteKingside: 'K',
  whiteQueenside: 'Q',
  blackKingside: 'k',
  blackQueenside: 'q',
};

/**
 * Parses a FEN string into a draft position.
 *
 * Trailing fields may be omitted (many tools copy only the piece placement, or the
 * placement and side to move). A missing side to move becomes `'unknown'`; other
 * missing fields keep their labeled defaults from `emptyDraft()`. Fields present in
 * the string are marked `'provided'`.
 */
export function parseFen(text: string): ParseFenResult {
  const trimmed = text.trim();
  if (trimmed === '') {
    return fail({ field: 'fen', message: 'FEN is empty.' });
  }

  const fields = trimmed.split(/\s+/);
  if (fields.length > MAX_FIELDS) {
    return fail({
      field: 'fen',
      message: `FEN has ${String(fields.length)} fields; expected at most ${String(MAX_FIELDS)}.`,
    });
  }

  const [placementText, sideText, castlingText, enPassantText, halfmoveText, fullmoveText] = fields;
  const errors: FenError[] = [];
  const collect = <T>(result: FieldResult<T>, fallback: T): T => {
    if (result.ok) return result.value;
    errors.push(result.error);
    return fallback;
  };

  const draft = emptyDraft();
  const board = collect(parsePlacement(placementText ?? ''), draft.board);
  const sideToMove =
    sideText === undefined ? draft.sideToMove : collect(parseSideToMove(sideText), 'unknown');
  const castling =
    castlingText === undefined
      ? draft.castling
      : collect(parseCastling(castlingText), draft.castling);
  const enPassant =
    enPassantText === undefined
      ? draft.enPassant
      : { value: collect(parseEnPassant(enPassantText), null), source: 'provided' as const };
  const halfmoveClock =
    halfmoveText === undefined
      ? draft.halfmoveClock
      : {
          value: collect(parseCounter(halfmoveText, 'halfmoveClock', 0), 0),
          source: 'provided' as const,
        };
  const fullmoveNumber =
    fullmoveText === undefined
      ? draft.fullmoveNumber
      : {
          value: collect(parseCounter(fullmoveText, 'fullmoveNumber', 1), 1),
          source: 'provided' as const,
        };

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    position: { board, sideToMove, castling, enPassant, halfmoveClock, fullmoveNumber },
  };
}

/**
 * Serializes a confirmed position to a six-field FEN string. Castling is always
 * written in the canonical `KQkq` order.
 */
export function toFen(position: ConfirmedPosition): string {
  const castling = CASTLING_RIGHTS.filter((right) => position.castling[right].value)
    .map((right) => CASTLING_LETTERS[right])
    .join('');
  return [
    placementToFen(position.board),
    position.sideToMove,
    castling === '' ? '-' : castling,
    position.enPassant.value ?? '-',
    String(position.halfmoveClock.value),
    String(position.fullmoveNumber.value),
  ].join(' ');
}

type FieldResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: FenError };

function fail(error: FenError): ParseFenResult {
  return { ok: false, errors: [error] };
}

function ok<T>(value: T): FieldResult<T> {
  return { ok: true, value };
}

function err(field: FenField, message: string): FieldResult<never> {
  return { ok: false, error: { field, message } };
}

function parsePlacement(text: string): FieldResult<Board> {
  const ranks = text.split('/');
  if (ranks.length !== 8) {
    return err(
      'placement',
      `Piece placement has ${String(ranks.length)} ranks; expected 8 separated by '/'.`,
    );
  }

  const board: Partial<Record<Square, Piece>> = {};
  for (const [index, rankText] of ranks.entries()) {
    const rankNumber = 8 - index;
    let file = 0;
    for (const char of rankText) {
      if (/^[1-8]$/.test(char)) {
        file += Number(char);
        continue;
      }
      const type = PIECE_TYPES[char.toLowerCase()];
      if (!type) {
        return err('placement', `Rank ${String(rankNumber)} contains invalid character '${char}'.`);
      }
      if (file < 8) {
        board[squareFromCoords(file, rankNumber - 1)] = {
          color: char === char.toUpperCase() ? 'w' : 'b',
          type,
        };
      }
      file += 1;
    }
    if (file !== 8) {
      return err(
        'placement',
        `Rank ${String(rankNumber)} describes ${String(file)} squares; expected 8.`,
      );
    }
  }
  return ok(board);
}

function parseSideToMove(text: string): FieldResult<Color> {
  if (text === 'w' || text === 'b') return ok(text);
  return err('sideToMove', `Side to move must be 'w' or 'b', got '${text}'.`);
}

function parseCastling(text: string): FieldResult<CastlingRights> {
  const provided = (value: boolean) => ({ value, source: 'provided' as const });
  const rights: Record<CastlingRight, { value: boolean; source: 'provided' }> = {
    whiteKingside: provided(false),
    whiteQueenside: provided(false),
    blackKingside: provided(false),
    blackQueenside: provided(false),
  };
  if (text === '-') return ok(rights);

  for (const char of text) {
    const right = CASTLING_RIGHTS.find((r) => CASTLING_LETTERS[r] === char);
    if (!right) {
      const message = /^[A-Ha-h]$/.test(char)
        ? `Castling field '${text}' uses Chess960 notation ('${char}'), which is not supported.`
        : `Castling field '${text}' contains invalid character '${char}'; use K, Q, k, q or '-'.`;
      return err('castling', message);
    }
    if (rights[right].value) {
      return err('castling', `Castling field '${text}' repeats '${char}'.`);
    }
    rights[right] = provided(true);
  }
  return ok(rights);
}

function parseEnPassant(text: string): FieldResult<Square | null> {
  if (text === '-') return ok(null);
  if (!isSquare(text)) {
    return err('enPassant', `En passant square must be a square like 'e3' or '-', got '${text}'.`);
  }
  if (text[1] !== '3' && text[1] !== '6') {
    return err('enPassant', `En passant square must be on rank 3 or 6, got '${text}'.`);
  }
  return ok(text);
}

function parseCounter(
  text: string,
  field: 'halfmoveClock' | 'fullmoveNumber',
  minimum: number,
): FieldResult<number> {
  const label = field === 'halfmoveClock' ? 'Halfmove clock' : 'Fullmove number';
  const value = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(value)) {
    return err(field, `${label} must be a whole number, got '${text}'.`);
  }
  if (value < minimum) {
    return err(field, `${label} must be at least ${String(minimum)}, got ${text}.`);
  }
  return ok(value);
}

function placementToFen(board: Board): string {
  const ranks: string[] = [];
  for (let rank = 7; rank >= 0; rank -= 1) {
    let row = '';
    let empty = 0;
    for (let file = 0; file < 8; file += 1) {
      const piece = board[squareFromCoords(file, rank)];
      if (!piece) {
        empty += 1;
        continue;
      }
      if (empty > 0) row += String(empty);
      empty = 0;
      row += piece.color === 'w' ? piece.type.toUpperCase() : piece.type;
    }
    if (empty > 0) row += String(empty);
    ranks.push(row);
  }
  return ranks.join('/');
}
