import { describe, expect, it } from 'vitest';
import { confirmPosition } from './confirm';
import { parseFen, toFen } from './fen';
import { emptyDraft, startingPosition, type DraftPosition } from './position';

function draft(fen: string): DraftPosition {
  const result = parseFen(fen);
  if (!result.ok) throw new Error(`Bad test FEN '${fen}': ${JSON.stringify(result.errors)}`);
  return result.position;
}

function errorCodes(position: DraftPosition) {
  const result = confirmPosition(position);
  if (result.ok) throw new Error('Expected confirmation to fail');
  return result.errors.map((error) => error.code);
}

describe('confirmPosition', () => {
  it('confirms the starting position', () => {
    const result = confirmPosition(startingPosition());
    expect(result.ok).toBe(true);
  });

  it('confirms a legal position and exports it as FEN', () => {
    const fen = 'rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3';
    const result = confirmPosition(draft(fen));
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(toFen(result.position)).toBe(fen);
  });

  it('requires the side to move, with an actionable message', () => {
    const result = confirmPosition(draft('4k3/8/8/8/8/8/8/4K3'));
    expect(result).toEqual({
      ok: false,
      errors: [
        { code: 'unknown-side-to-move', message: 'Choose whose turn it is (White or Black).' },
      ],
    });
  });

  it('returns validation errors for an illegal position', () => {
    expect(errorCodes(draft('4k3/8/8/8/8/8/8/8 w - - 0 1'))).toEqual(['missing-king']);
    expect(errorCodes(draft('4k3/8/8/8/8/8/8/4R1K1 w - - 0 1'))).toEqual(['opponent-in-check']);
  });

  it('reports a missing side to move and validation errors together', () => {
    expect(errorCodes(emptyDraft())).toEqual([
      'unknown-side-to-move',
      'missing-king',
      'missing-king',
    ]);
  });

  it('keeps metadata sources, so accepted defaults can still be labeled', () => {
    const result = confirmPosition(draft('4k3/8/8/8/8/8/8/4K3 b'));
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.position.sideToMove).toBe('b');
    expect(result.position.castling.whiteKingside).toEqual({ value: false, source: 'default' });
    expect(result.position.enPassant.source).toBe('default');
    expect(result.position.halfmoveClock.source).toBe('default');
    expect(result.position.fullmoveNumber.source).toBe('default');
  });

  it('does not modify the draft', () => {
    const position = startingPosition();
    const snapshot = structuredClone(position);
    confirmPosition(position);
    expect(position).toEqual(snapshot);
  });
});
