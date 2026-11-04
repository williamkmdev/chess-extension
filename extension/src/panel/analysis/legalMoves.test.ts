import { describe, expect, it } from 'vitest';
import { confirmed } from '../../engine/testing';
import type { Square } from '../../shared/position';
import { findTarget, legalMoves, toUci } from './legalMoves';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const targetsFrom = (fen: string, square: Square) =>
  (legalMoves(confirmed(fen)).get(square) ?? []).map((target) => target.to).sort();

describe('legalMoves', () => {
  it("lists only the side to move's pieces that can move", () => {
    const moves = legalMoves(confirmed(START));
    expect([...moves.keys()].sort()).toEqual(
      ['a2', 'b1', 'b2', 'c2', 'd2', 'e2', 'f2', 'g1', 'g2', 'h2'].sort(),
    );
    expect(targetsFrom(START, 'g1')).toEqual(['f3', 'h3']);
    expect(targetsFrom(START, 'e2')).toEqual(['e3', 'e4']);
    expect([...moves.values()].flat().every((t) => !t.capture && !t.promotion)).toBe(true);
  });

  it('respects pins and check', () => {
    // The e2 knight is pinned by the e8 rook.
    expect(targetsFrom('4r1k1/8/8/8/8/8/4N3/4K3 w - - 0 1', 'e2')).toEqual([]);
    // In check from the rook: the king must step off the e-file.
    expect(targetsFrom('4r1k1/8/8/8/8/8/8/4K3 w - - 0 1', 'e1')).toEqual(['d1', 'd2', 'f1', 'f2']);
  });

  it('includes castling only when the rights allow it', () => {
    expect(targetsFrom('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1')).toContain('g1');
    expect(targetsFrom('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1')).toContain('c1');
    expect(targetsFrom('r3k2r/8/8/8/8/8/8/R3K2R w Qkq - 0 1', 'e1')).not.toContain('g1');
  });

  it('marks captures, including en passant', () => {
    const moves = legalMoves(confirmed('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1'));
    expect(findTarget(moves, 'e5', 'd6')).toEqual({ to: 'd6', promotion: false, capture: true });
    expect(findTarget(moves, 'e5', 'e6')).toEqual({ to: 'e6', promotion: false, capture: false });
  });

  it('lists each promotion square once, marked as a promotion', () => {
    const moves = legalMoves(confirmed('1n2k3/P7/8/8/8/8/8/4K3 w - - 0 1'));
    expect(moves.get('a7')).toEqual([
      { to: 'a8', promotion: true, capture: false },
      { to: 'b8', promotion: true, capture: true },
    ]);
  });

  it('is empty in checkmate and stalemate', () => {
    expect(legalMoves(confirmed('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1')).size).toBe(0);
    expect(legalMoves(confirmed('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')).size).toBe(0);
  });
});

describe('findTarget', () => {
  it('returns undefined for an illegal move', () => {
    const moves = legalMoves(confirmed(START));
    expect(findTarget(moves, 'e2', 'e5')).toBeUndefined();
    expect(findTarget(moves, 'e7', 'e5')).toBeUndefined();
  });
});

describe('toUci', () => {
  it('writes moves in engine notation', () => {
    expect(toUci('e2', 'e4')).toBe('e2e4');
    expect(toUci('a7', 'a8', 'n')).toBe('a7a8n');
  });
});
