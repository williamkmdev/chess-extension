import { describe, expect, it } from 'vitest';
import {
  hasKnownSideToMove,
  parseFen,
  toFen,
  type FenField,
  type FenSerializablePosition,
} from './fen';
import { CASTLING_RIGHTS, emptyDraft, startingPosition, type DraftPosition } from './position';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function parsed(fen: string): DraftPosition {
  const result = parseFen(fen);
  if (!result.ok) {
    throw new Error(`Expected '${fen}' to parse: ${JSON.stringify(result.errors)}`);
  }
  return result.position;
}

function serializable(position: DraftPosition): FenSerializablePosition {
  if (!hasKnownSideToMove(position)) throw new Error('Side to move is unknown');
  return position;
}

function errorsFor(fen: string) {
  const result = parseFen(fen);
  if (result.ok) throw new Error(`Expected '${fen}' to be rejected`);
  return result.errors;
}

function expectSingleError(fen: string, field: FenField, messagePart: string) {
  const errors = errorsFor(fen);
  expect(errors).toHaveLength(1);
  expect(errors[0]?.field).toBe(field);
  expect(errors[0]?.message).toContain(messagePart);
}

describe('parseFen: full FEN', () => {
  it('parses the starting position', () => {
    expect(parsed(START_FEN)).toEqual(startingPosition());
  });

  it('parses pieces onto the right squares and colors', () => {
    const position = parsed('4k3/8/8/3pP3/8/8/8/R3K2R w KQ d6 0 3');
    expect(position.board).toEqual({
      e8: { color: 'b', type: 'k' },
      d5: { color: 'b', type: 'p' },
      e5: { color: 'w', type: 'p' },
      a1: { color: 'w', type: 'r' },
      e1: { color: 'w', type: 'k' },
      h1: { color: 'w', type: 'r' },
    });
    expect(position.enPassant).toEqual({ value: 'd6', source: 'provided' });
    expect(position.fullmoveNumber).toEqual({ value: 3, source: 'provided' });
  });

  it('marks every field present in the FEN as provided', () => {
    const position = parsed('8/8/8/8/8/8/8/8 b - - 12 40');
    expect(position.sideToMove).toBe('b');
    for (const right of CASTLING_RIGHTS) {
      expect(position.castling[right]).toEqual({ value: false, source: 'provided' });
    }
    expect(position.enPassant).toEqual({ value: null, source: 'provided' });
    expect(position.halfmoveClock).toEqual({ value: 12, source: 'provided' });
    expect(position.fullmoveNumber).toEqual({ value: 40, source: 'provided' });
  });

  it.each([
    ['KQkq', [true, true, true, true]],
    ['K', [true, false, false, false]],
    ['Q', [false, true, false, false]],
    ['k', [false, false, true, false]],
    ['q', [false, false, false, true]],
    ['Kq', [true, false, false, true]],
    ['Qk', [false, true, true, false]],
    ['-', [false, false, false, false]],
  ] as const)('parses castling %s', (field, expected) => {
    const position = parsed(`r3k2r/8/8/8/8/8/8/R3K2R w ${field} - 0 1`);
    expect(CASTLING_RIGHTS.map((right) => position.castling[right].value)).toEqual(expected);
  });

  it('accepts castling letters in any order', () => {
    const position = parsed('r3k2r/8/8/8/8/8/8/R3K2R w qkQK - 0 1');
    expect(CASTLING_RIGHTS.every((right) => position.castling[right].value)).toBe(true);
  });

  it('tolerates surrounding and repeated whitespace', () => {
    expect(parsed(`  \t${START_FEN.replaceAll(' ', '   ')}\n`)).toEqual(startingPosition());
  });

  it('accepts very large but safe move counters', () => {
    const position = parsed('8/8/8/8/8/8/8/8 w - - 4000 9999999');
    expect(position.halfmoveClock.value).toBe(4000);
    expect(position.fullmoveNumber.value).toBe(9999999);
  });
});

describe('parseFen: omitted trailing fields', () => {
  const placement = '4k3/8/8/8/8/8/8/4K3';

  it('placement only: side to move unknown, everything else defaulted', () => {
    const position = parsed(placement);
    const defaults = emptyDraft();
    expect(position.sideToMove).toBe('unknown');
    expect(position.castling).toEqual(defaults.castling);
    expect(position.enPassant).toEqual(defaults.enPassant);
    expect(position.halfmoveClock).toEqual(defaults.halfmoveClock);
    expect(position.fullmoveNumber).toEqual(defaults.fullmoveNumber);
    expect(position.board.e1).toEqual({ color: 'w', type: 'k' });
  });

  it('two fields: side to move provided, rest defaulted', () => {
    const position = parsed(`${placement} b`);
    expect(position.sideToMove).toBe('b');
    expect(position.castling.whiteKingside.source).toBe('default');
    expect(position.enPassant.source).toBe('default');
  });

  it('three fields: castling provided, rest defaulted', () => {
    const position = parsed(`${placement} w -`);
    expect(position.castling.whiteKingside).toEqual({ value: false, source: 'provided' });
    expect(position.enPassant.source).toBe('default');
  });

  it('four fields: en passant provided, counters defaulted', () => {
    const position = parsed(`${placement} w - -`);
    expect(position.enPassant).toEqual({ value: null, source: 'provided' });
    expect(position.halfmoveClock).toEqual({ value: 0, source: 'default' });
    expect(position.fullmoveNumber).toEqual({ value: 1, source: 'default' });
  });

  it('five fields: halfmove clock provided, fullmove number defaulted', () => {
    const position = parsed(`${placement} w - - 7`);
    expect(position.halfmoveClock).toEqual({ value: 7, source: 'provided' });
    expect(position.fullmoveNumber).toEqual({ value: 1, source: 'default' });
  });
});

describe('parseFen: rejections', () => {
  it.each(['', '   ', '\n\t'])('rejects empty input %j', (fen) => {
    expectSingleError(fen, 'fen', 'empty');
  });

  it('rejects more than six fields', () => {
    expectSingleError(`${START_FEN} extra`, 'fen', '7 fields');
  });

  it.each([
    ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP', '7 ranks'],
    ['rnbqkbnr/pppppppp/8/8/8/8/8/PPPPPPPP/RNBQKBNR', '9 ranks'],
    ['rnbqkbnr/ppppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', 'Rank 7 describes 9 squares'],
    ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPP/RNBQKBNR', 'Rank 2 describes 7 squares'],
    ['rnbqkbnr/pppppppp/9/8/8/8/PPPPPPPP/RNBQKBNR', "invalid character '9'"],
    ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNX', "Rank 1 contains invalid character 'X'"],
    ['rnbqkbnr/pppppppp/8/0/8/8/PPPPPPPP/RNBQKBNR', "invalid character '0'"],
    ['rnbqkbnr/pppppppp/8//8/8/PPPPPPPP/RNBQKBNR', 'Rank 5 describes 0 squares'],
  ])('rejects bad placement %s', (placement, messagePart) => {
    expectSingleError(`${placement} w - - 0 1`, 'placement', messagePart);
  });

  it.each(['W', 'white', '-', 'x'])('rejects side to move %j', (side) => {
    expectSingleError(`8/8/8/8/8/8/8/8 ${side} - - 0 1`, 'sideToMove', "must be 'w' or 'b'");
  });

  it.each([
    ['KQx', "invalid character 'x'"],
    ['-K', "invalid character '-'"],
    ['KK', "repeats 'K'"],
    ['KQkqq', "repeats 'q'"],
    ['HAha', 'Chess960'],
  ])('rejects castling %j', (castling, messagePart) => {
    expectSingleError(`8/8/8/8/8/8/8/8 w ${castling} - 0 1`, 'castling', messagePart);
  });

  it.each([
    ['e4', 'rank 3 or 6'],
    ['a1', 'rank 3 or 6'],
    ['i3', "like 'e3'"],
    ['E3', "like 'e3'"],
    ['e33', "like 'e3'"],
  ])('rejects en passant %j', (square, messagePart) => {
    expectSingleError(`8/8/8/8/8/8/8/8 w - ${square} 0 1`, 'enPassant', messagePart);
  });

  it.each(['-1', '1.5', 'x', '+3', '99999999999999999999'])(
    'rejects halfmove clock %j',
    (value) => {
      expectSingleError(`8/8/8/8/8/8/8/8 w - - ${value} 1`, 'halfmoveClock', 'whole number');
    },
  );

  it('rejects a fullmove number of 0', () => {
    expectSingleError('8/8/8/8/8/8/8/8 w - - 0 0', 'fullmoveNumber', 'at least 1');
  });

  it('reports problems in several fields at once', () => {
    const errors = errorsFor('8/8/8/8/8/8/8/9 x KK e5 -1 0');
    expect(errors.map((error) => error.field)).toEqual([
      'placement',
      'sideToMove',
      'castling',
      'enPassant',
      'halfmoveClock',
      'fullmoveNumber',
    ]);
  });
});

describe('toFen', () => {
  it('serializes the starting position', () => {
    expect(toFen(serializable(startingPosition()))).toBe(START_FEN);
  });

  it.each([
    START_FEN,
    'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
    'rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3',
    'r3k2r/8/8/8/8/8/8/R3K2R w Kq - 5 20',
    'r3k2r/8/8/8/8/8/8/R3K2R b Qk - 0 1',
    '8/8/8/8/8/8/8/8 w - - 0 1',
    '8/5k2/8/8/8/8/1K6/8 b - - 99 250',
    '7K/8/8/8/8/8/8/k7 w - - 4000 9999999',
  ])('round-trips %s', (fen) => {
    expect(toFen(serializable(parsed(fen)))).toBe(fen);
  });

  it('writes castling in canonical KQkq order', () => {
    const position = parsed('r3k2r/8/8/8/8/8/8/R3K2R w qkQK - 0 1');
    expect(toFen(serializable(position))).toBe('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  });

  it('writes defaults for omitted fields once the side to move is known', () => {
    expect(toFen(serializable(parsed('4k3/8/8/8/8/8/8/4K3 w')))).toBe(
      '4k3/8/8/8/8/8/8/4K3 w - - 0 1',
    );
  });

  it('requires a known side to move at compile time', () => {
    const draft = parsed('4k3/8/8/8/8/8/8/4K3');
    expect(hasKnownSideToMove(draft)).toBe(false);
    // Never called: this only checks that the type system rejects the call.
    // @ts-expect-error A draft whose side to move may be unknown cannot be serialized.
    const serializeUnchecked = () => toFen(draft);
    expect(serializeUnchecked).toBeTypeOf('function');
  });
});
