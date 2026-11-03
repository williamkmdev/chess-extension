import { describe, expect, it } from 'vitest';
import { formatEvaluation, gameOver, pvToSan } from './notation';
import { confirmed } from './testing';
import type { Evaluation } from './uci';

const cp = (centipawns: number, bound: Evaluation['bound'] = 'exact'): Evaluation => ({
  kind: 'cp',
  centipawns,
  bound,
});
const mate = (winner: 'w' | 'b', moves: number): Evaluation => ({
  kind: 'mate',
  winner,
  moves,
  bound: 'exact',
});

describe('formatEvaluation', () => {
  it.each([
    [35, '+0.35'],
    [-120, '−1.20'],
    [0, '0.00'],
    [1, '+0.01'],
    [-1, '−0.01'],
    [2350, '+23.50'],
  ])('formats %i centipawns as %s', (centipawns, text) => {
    expect(formatEvaluation(cp(centipawns))).toBe(text);
  });

  it('never shows a signed zero', () => {
    expect(formatEvaluation(cp(-0))).toBe('0.00');
  });

  it('marks bounds', () => {
    expect(formatEvaluation(cp(50, 'lower'))).toBe('≥ +0.50');
    expect(formatEvaluation(cp(-50, 'upper'))).toBe('≤ −0.50');
  });

  it('names the side that mates', () => {
    expect(formatEvaluation(mate('w', 3))).toBe('Mate in 3 for White');
    expect(formatEvaluation(mate('b', 1))).toBe('Mate in 1 for Black');
    expect(formatEvaluation(mate('b', 0))).toBe('Checkmate: Black wins');
  });
});

describe('pvToSan', () => {
  const start = confirmed('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');

  it('numbers moves from White', () => {
    expect(pvToSan(start, ['e2e4', 'e7e5', 'g1f3', 'b8c6'])).toBe('1. e4 e5 2. Nf3 Nc6');
  });

  it('numbers moves when Black is to move, from the position’s move number', () => {
    const position = confirmed('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2');
    expect(pvToSan(position, ['d8h4'])).toBe('2... Qh4#');
    expect(pvToSan(confirmed('4k3/8/8/8/8/8/8/R3K3 b Q - 3 40'), ['e8d7', 'a1a7'])).toBe(
      '40... Kd7 41. Ra7+',
    );
  });

  it('handles castling and promotion', () => {
    expect(pvToSan(confirmed('4k3/8/8/8/8/8/8/R3K3 w Q - 0 1'), ['e1c1'])).toBe('1. O-O-O');
    expect(pvToSan(confirmed('8/4P1k1/8/8/8/8/8/4K3 w - - 0 1'), ['e7e8q'])).toBe('1. e8=Q');
    expect(pvToSan(confirmed('8/4P1k1/8/8/8/8/8/4K3 w - - 0 1'), ['e7e8n'])).toBe('1. e8=N+');
  });

  it('limits the number of plies', () => {
    expect(pvToSan(start, ['e2e4', 'e7e5', 'g1f3', 'b8c6'], 3)).toBe('1. e4 e5 2. Nf3');
  });

  it('stops at the first illegal move', () => {
    expect(pvToSan(start, ['e2e4', 'e2e4', 'g1f3'])).toBe('1. e4');
    expect(pvToSan(start, ['a1a8'])).toBe('');
    expect(pvToSan(start, [])).toBe('');
  });
});

describe('gameOver', () => {
  it('detects checkmate and names the winner', () => {
    expect(gameOver(confirmed('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1'))).toEqual({
      kind: 'checkmate',
      winner: 'w',
    });
    expect(
      gameOver(confirmed('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3')),
    ).toEqual({ kind: 'checkmate', winner: 'b' });
  });

  it('detects stalemate', () => {
    expect(gameOver(confirmed('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'))).toEqual({ kind: 'stalemate' });
  });

  it('returns null when there are legal moves', () => {
    expect(gameOver(confirmed('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'))).toBe(
      null,
    );
    // In check but not mated.
    expect(gameOver(confirmed('4k3/8/8/8/8/8/4q3/4K3 w - - 0 1'))).toBeNull();
  });
});
