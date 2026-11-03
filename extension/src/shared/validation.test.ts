import { describe, expect, it } from 'vitest';
import { parseFen } from './fen';
import { startingPosition, type DraftPosition } from './position';
import { validatePosition, type PositionErrorCode } from './validation';

function position(fen: string): DraftPosition {
  const result = parseFen(fen);
  if (!result.ok) throw new Error(`Bad test FEN '${fen}': ${JSON.stringify(result.errors)}`);
  return result.position;
}

const codes = (fen: string) => validatePosition(position(fen)).map((error) => error.code);

function onlyError(fen: string, code: PositionErrorCode) {
  const errors = validatePosition(position(fen));
  expect(errors.map((error) => error.code)).toEqual([code]);
  const [error] = errors;
  if (!error) throw new Error('unreachable');
  return error;
}

describe('valid positions', () => {
  it('accepts the starting position', () => {
    expect(validatePosition(startingPosition())).toEqual([]);
  });

  it.each([
    // After 1. e4 with en passant square recorded
    'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
    // Open Sicilian middlegame
    'r1bqkb1r/pp2pppp/2np1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 2 6',
    // Side to move in check is fine
    '4k3/8/8/8/8/8/4q3/4K3 w - - 0 1',
    // Bare kings
    '8/8/4k3/8/8/4K3/8/8 b - - 0 70',
    // Two promoted queens with two pawns missing
    '4k3/8/8/8/8/8/PPPPPP2/QQ2K3 w - - 0 60',
    // Placement-only FEN: unknown side, defaulted metadata
    'r3k2r/8/8/8/8/8/8/R3K2R',
  ])('accepts %s', (fen) => {
    expect(validatePosition(position(fen))).toEqual([]);
  });
});

describe('kings', () => {
  it('requires a king for each side', () => {
    const errors = validatePosition(position('8/8/8/8/8/8/8/4K3 w - - 0 1'));
    expect(errors).toEqual([{ code: 'missing-king', message: 'Black has no king.' }]);
    expect(codes('8/8/8/8/8/8/8/8 w - - 0 1')).toEqual(['missing-king', 'missing-king']);
  });

  it('rejects more than one king per side, listing their squares', () => {
    const error = onlyError('4k3/8/8/8/8/8/8/K3K3 w - - 0 1', 'too-many-kings');
    expect(error.message).toContain('White has 2 kings');
    expect(error.squares).toEqual(expect.arrayContaining(['a1', 'e1']));
  });
});

describe('pawns on the back rank', () => {
  it.each([
    ['P3k3/8/8/8/8/8/8/4K3 w - - 0 1', 'a8', 'White pawn on a8'],
    ['4k3/8/8/8/8/8/8/4K2p w - - 0 1', 'h1', 'Black pawn on h1'],
  ])('rejects %s', (fen, square, messagePart) => {
    const error = onlyError(fen, 'pawn-on-back-rank');
    expect(error.squares).toEqual([square]);
    expect(error.message).toContain(messagePart);
  });
});

describe('piece counts', () => {
  it('rejects more than 8 pawns', () => {
    const error = onlyError('4k3/8/8/8/8/1P6/PPPPPPPP/4K3 w - - 0 1', 'too-many-pawns');
    expect(error.squares).toHaveLength(9);
  });

  it('rejects promoted pieces beyond the missing pawns', () => {
    // Two queens with all 8 pawns still on the board
    const error = onlyError('4k3/8/8/8/8/8/PPPPPPPP/QQ2K3 w - - 0 1', 'impossible-promotions');
    expect(error.message).toBe(
      'White has more promoted pieces (1) than missing pawns (0) that could have promoted.',
    );
  });

  it('counts extras across piece types', () => {
    // 3 knights + 3 rooks = 2 extras, but only 1 pawn missing
    expect(codes('4k3/8/8/8/8/8/PPPPPPP1/NNNRRRK1 w - - 0 1')).toEqual(['impossible-promotions']);
    // ...and with 2 pawns missing it's possible
    expect(codes('4k3/8/8/8/8/8/PPPPPP2/NNNRRRK1 w - - 0 1')).toEqual([]);
  });

  it('counts bishops per square color', () => {
    // Two dark-squared bishops (a3, c1) with all 8 pawns: one must be promoted
    expect(codes('4k3/8/8/8/PPPPPPPP/B7/8/2B1K3 w - - 0 20')).toEqual(['impossible-promotions']);
    // One dark (c1) and one light (f1): the original pair
    expect(codes('4k3/8/8/8/PPPPPPPP/8/8/2B1KB2 w - - 0 20')).toEqual([]);
    // Two dark-squared bishops with a pawn missing: possible
    expect(codes('4k3/8/8/8/PPPPPPP1/B7/8/2B1K3 w - - 0 20')).toEqual([]);
  });
});

describe('checks', () => {
  it('rejects the side not to move being in check, listing king and attackers', () => {
    const error = onlyError('4k3/8/8/8/8/8/8/4R1K1 w - - 0 1', 'opponent-in-check');
    expect(error.message).toContain("Black is in check but it's White's turn");
    expect(error.squares).toEqual(['e8', 'e1']);
  });

  it('detects discovered and double attacks', () => {
    const error = onlyError('4k3/8/5N2/8/8/8/8/4R1K1 w - - 0 1', 'opponent-in-check');
    expect(error.squares).toEqual(expect.arrayContaining(['e8', 'e1', 'f6']));
  });

  it('rejects adjacent kings whoever is to move', () => {
    expect(codes('8/8/8/3kK3/8/8/8/8 w - - 0 1')).toEqual(['opponent-in-check']);
    expect(codes('8/8/8/3kK3/8/8/8/8 b - - 0 1')).toEqual(['opponent-in-check']);
  });

  it('with side to move unknown, allows one king in check', () => {
    expect(codes('4k3/8/8/8/8/8/8/4R1K1')).toEqual([]);
  });

  it('with side to move unknown, rejects both kings in check', () => {
    // White rook h8 checks e8; black rook a1 checks e1.
    const error = onlyError('4k2R/8/8/8/8/8/8/r3K3', 'both-kings-in-check');
    expect(error.squares).toEqual(expect.arrayContaining(['e1', 'a1', 'e8', 'h8']));
  });

  it('skips check detection when kings are missing or duplicated', () => {
    expect(codes('4r3/8/8/8/8/8/8/4K3 w - - 0 1')).toEqual(['missing-king']);
  });
});

describe('castling rights', () => {
  it('rejects a right whose king has left its home square', () => {
    const error = onlyError('r3k2r/8/8/8/8/8/8/R4K1R w K - 0 1', 'castling-without-king');
    expect(error.squares).toEqual(['e1']);
    expect(error.message).toContain("White can't castle kingside");
  });

  it('rejects a right whose rook is missing', () => {
    const error = onlyError('r3k3/8/8/8/8/8/8/R3K2R w k - 0 1', 'castling-without-rook');
    expect(error.squares).toEqual(['h8']);
    expect(error.message).toContain("Black can't castle kingside");
  });

  it('rejects a right when the corner holds the wrong piece or color', () => {
    expect(codes('r3k2r/8/8/8/8/8/8/R3K2N w K - 0 1')).toEqual(['castling-without-rook']);
    expect(codes('r3k2r/8/8/8/8/8/8/R3K2r w K - 0 1')).toEqual(['castling-without-rook']);
  });

  it('reports king and rook problems together', () => {
    expect(codes('4k3/8/8/8/8/8/8/3K4 w Q - 0 1')).toEqual([
      'castling-without-king',
      'castling-without-rook',
    ]);
  });

  it('never flags rights that are off, even with pieces on home squares', () => {
    expect(codes('r3k2r/8/8/8/8/8/8/R3K2R w - - 0 1')).toEqual([]);
  });
});

describe('en passant', () => {
  it.each([
    'rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3',
    'rnbqkbnr/pppp1ppp/8/8/3pP3/8/PPP2PPP/RNBQKBNR b KQkq e3 0 3',
  ])('accepts a consistent square: %s', (fen) => {
    expect(codes(fen)).toEqual([]);
  });

  it('rejects the wrong side to move', () => {
    const error = onlyError('4k3/8/8/3p4/8/8/8/4K3 b - d6 0 1', 'en-passant-wrong-side');
    expect(error.message).toContain('must be White to move');
  });

  it('skips the side check while side to move is unknown', () => {
    const draft = position('4k3/8/8/3p4/8/8/8/4K3 b - d6 0 1');
    expect(validatePosition({ ...draft, sideToMove: 'unknown' })).toEqual([]);
  });

  it('rejects occupied squares the pawn just passed through', () => {
    const error = onlyError('4k3/3n4/8/3p4/8/8/8/4K3 w - d6 0 1', 'en-passant-square-occupied');
    expect(error.squares).toEqual(['d7']);
  });

  it('rejects a missing double-pushed pawn', () => {
    const error = onlyError('4k3/8/8/8/8/8/8/4K3 w - d6 0 1', 'en-passant-no-pawn');
    expect(error.squares).toEqual(['d5']);
    expect(codes('4k3/8/8/3P4/8/8/8/4K3 w - d6 0 1')).toEqual(['en-passant-no-pawn']);
  });

  it('requires a halfmove clock of 0, since the last move was a pawn move', () => {
    const error = onlyError('4k3/8/8/3p4/8/8/8/4K3 w - d6 99 20', 'en-passant-halfmove-clock');
    expect(error.message).toContain('must be 0, not 99');
  });
});

it('reports several problems at once', () => {
  expect(codes('P7/8/8/8/8/8/8/R7 w K e3 0 1')).toEqual([
    'missing-king',
    'missing-king',
    'pawn-on-back-rank',
    'castling-without-king',
    'castling-without-rook',
    'en-passant-wrong-side',
    'en-passant-no-pawn',
  ]);
});
