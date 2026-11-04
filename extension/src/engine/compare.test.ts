import { describe, expect, it } from 'vitest';
import { compareMove, describeComparison, type CompareInput } from './compare';
import type { Evaluation } from './uci';

const cp = (centipawns: number): Evaluation => ({ kind: 'cp', centipawns, bound: 'exact' });
const mate = (winner: 'w' | 'b', moves: number): Evaluation => ({
  kind: 'mate',
  winner,
  moves,
  bound: 'exact',
});
const compare = (input: Partial<CompareInput> & Pick<CompareInput, 'best' | 'played'>) =>
  compareMove({ mover: 'w', isBestMove: false, ...input });

describe('compareMove', () => {
  it('recognizes the engine’s own choice, whatever the scores say', () => {
    expect(compare({ best: cp(30), played: cp(10), isBestMove: true })).toEqual({
      kind: 'best-move',
    });
  });

  it('measures the loss from the mover’s point of view', () => {
    // White: +0.35 best, +0.10 played → 0.25 worse.
    expect(compare({ best: cp(35), played: cp(10) })).toEqual({ kind: 'worse', pawns: 0.25 });
    // Black: −0.35 best (good for Black), −0.10 played → 0.25 worse for Black.
    expect(compare({ best: cp(-35), played: cp(-10), mover: 'b' })).toEqual({
      kind: 'worse',
      pawns: 0.25,
    });
    // Black: the played move is better for White, so worse for Black.
    expect(compare({ best: cp(20), played: cp(150), mover: 'b' })).toEqual({
      kind: 'worse',
      pawns: 1.3,
    });
  });

  it('never reports a negative loss from search noise', () => {
    expect(compare({ best: cp(20), played: cp(25) })).toEqual({ kind: 'as-good' });
    expect(compare({ best: cp(20), played: cp(20) })).toEqual({ kind: 'as-good' });
    expect(compare({ best: cp(-20), played: cp(-40), mover: 'b' })).toEqual({ kind: 'as-good' });
  });

  it('reports a missed mate', () => {
    expect(compare({ best: mate('w', 3), played: cp(500) })).toEqual({
      kind: 'misses-mate',
      moves: 3,
    });
    expect(compare({ best: mate('b', 1), played: cp(-900), mover: 'b' })).toEqual({
      kind: 'misses-mate',
      moves: 1,
    });
    expect(compare({ best: mate('w', 2), played: mate('b', 4) })).toEqual({
      kind: 'misses-mate',
      moves: 2,
    });
  });

  it('counts the mover’s mate after the move from before it (one move more)', () => {
    // Best: mate in 2. After the played move the engine sees mate in 1 → also mate in 2.
    expect(compare({ best: mate('w', 2), played: mate('w', 1) })).toEqual({ kind: 'as-good' });
    // After the played move: mate in 3 → mate in 4 from before it.
    expect(compare({ best: mate('w', 2), played: mate('w', 3) })).toEqual({
      kind: 'slower-mate',
      moves: 4,
      bestMoves: 2,
    });
    // The played move delivers checkmate (mate 0 after it) → mate in 1.
    expect(compare({ best: mate('b', 1), played: mate('b', 0), mover: 'b' })).toEqual({
      kind: 'as-good',
    });
  });

  it('reports a move that allows mate', () => {
    expect(compare({ best: cp(40), played: mate('b', 2) })).toEqual({
      kind: 'allows-mate',
      moves: 2,
    });
    expect(compare({ best: cp(-40), played: mate('w', 1), mover: 'b' })).toEqual({
      kind: 'allows-mate',
      moves: 1,
    });
  });

  it('when mated either way, only a quicker mate is worse', () => {
    expect(compare({ best: mate('b', 5), played: mate('b', 2) })).toEqual({
      kind: 'allows-mate',
      moves: 2,
      bestMoves: 5,
    });
    expect(compare({ best: mate('b', 5), played: mate('b', 5) })).toEqual({ kind: 'as-good' });
    expect(compare({ best: mate('b', 3), played: cp(-800) })).toEqual({ kind: 'as-good' });
  });

  it('treats a stalemate as a 0.00 score', () => {
    expect(compare({ best: cp(600), played: cp(0) })).toEqual({ kind: 'worse', pawns: 6 });
  });
});

describe('describeComparison', () => {
  it.each([
    [{ kind: 'best-move' } as const, 'e4 is Stockfish’s choice.'],
    [{ kind: 'as-good' } as const, 'e4 is as good as Stockfish’s choice.'],
    [
      { kind: 'worse', pawns: 0.25 } as const,
      'e4 is 0.25 pawns worse for White than Stockfish’s choice.',
    ],
    [
      { kind: 'worse', pawns: 1 } as const,
      'e4 is 1.00 pawn worse for White than Stockfish’s choice.',
    ],
    [{ kind: 'misses-mate', moves: 3 } as const, 'e4 misses mate in 3.'],
    [{ kind: 'slower-mate', moves: 4, bestMoves: 2 } as const, 'e4 mates in 4 instead of 2.'],
    [{ kind: 'allows-mate', moves: 2 } as const, 'e4 allows mate in 2.'],
    [
      { kind: 'allows-mate', moves: 2, bestMoves: 5 } as const,
      'e4 allows mate in 2; Stockfish’s choice holds out until mate in 5.',
    ],
  ])('%o', (comparison, text) => {
    expect(describeComparison(comparison, 'e4', 'w')).toBe(text);
  });
});
