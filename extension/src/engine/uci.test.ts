import { describe, expect, it } from 'vitest';
import { confirmPosition } from '../shared/confirm';
import { parseFen } from '../shared/fen';
import { startingPosition, type ConfirmedPosition } from '../shared/position';
import {
  goCommand,
  isUciMove,
  parseUciLine,
  positionCommand,
  setOptionCommand,
  toWhitePerspective,
  type EngineScore,
} from './uci';

function confirmed(fen: string): ConfirmedPosition {
  const parsed = parseFen(fen);
  if (!parsed.ok) throw new Error('bad FEN');
  const result = confirmPosition(parsed.position);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.position;
}

describe('commands', () => {
  it('sends confirmed positions as FEN', () => {
    const start = confirmPosition(startingPosition());
    if (!start.ok) throw new Error('unreachable');
    expect(positionCommand(start.position)).toBe(
      'position fen rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    );
    expect(positionCommand(confirmed('4k3/8/8/8/8/8/8/4K3 b - - 5 40'))).toBe(
      'position fen 4k3/8/8/8/8/8/8/4K3 b - - 5 40',
    );
  });

  it('builds go commands from limits', () => {
    expect(goCommand({ depth: 18 })).toBe('go depth 18');
    expect(goCommand({ movetimeMs: 2000 })).toBe('go movetime 2000');
    expect(goCommand({ depth: 20, nodes: 1000000 })).toBe('go depth 20 nodes 1000000');
    expect(goCommand({})).toBe('go infinite');
    expect(goCommand({ infinite: true })).toBe('go infinite');
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects invalid limit %d', (value) => {
    expect(() => goCommand({ depth: value })).toThrow(RangeError);
  });

  it('builds setoption commands and refuses injected text', () => {
    expect(setOptionCommand('MultiPV', 3)).toBe('setoption name MultiPV value 3');
    expect(setOptionCommand('UCI_ShowWDL', true)).toBe('setoption name UCI_ShowWDL value true');
    expect(() => setOptionCommand('Hash', '16\nquit')).toThrow();
    expect(() => setOptionCommand('Hash value 1\ngo', 16)).toThrow();
  });
});

describe('parseUciLine', () => {
  it('parses handshake replies', () => {
    expect(parseUciLine('uciok')).toEqual({ type: 'uciok' });
    expect(parseUciLine('readyok\r')).toEqual({ type: 'readyok' });
  });

  it('parses a full Stockfish info line', () => {
    const line =
      'info depth 20 seldepth 27 multipv 1 score cp 31 nodes 1442561 nps 1201300 ' +
      'hashfull 466 tbhits 0 time 1201 pv e2e4 e7e5 g1f3 b8c6 f1b5';
    expect(parseUciLine(line)).toEqual({
      type: 'info',
      depth: 20,
      selDepth: 27,
      multiPv: 1,
      score: { kind: 'cp', centipawns: 31, bound: 'exact' },
      nodes: 1442561,
      nps: 1201300,
      timeMs: 1201,
      pv: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5'],
    });
  });

  it('parses mate scores and bounds', () => {
    expect(parseUciLine('info depth 12 score mate 3 pv d1h5 g7g6 h5f7')).toMatchObject({
      score: { kind: 'mate', moves: 3, bound: 'exact' },
    });
    expect(parseUciLine('info depth 9 score mate -2 pv e8d8')).toMatchObject({
      score: { kind: 'mate', moves: -2 },
    });
    expect(parseUciLine('info depth 15 score cp -45 lowerbound nodes 10 pv a2a3')).toMatchObject({
      score: { kind: 'cp', centipawns: -45, bound: 'lower' },
      nodes: 10,
      pv: ['a2a3'],
    });
    expect(parseUciLine('info depth 15 score cp 80 upperbound')).toMatchObject({
      score: { kind: 'cp', centipawns: 80, bound: 'upper' },
    });
  });

  it('parses a checkmated position (mate 0, no pv)', () => {
    expect(parseUciLine('info depth 0 score mate 0')).toEqual({
      type: 'info',
      depth: 0,
      multiPv: 1,
      score: { kind: 'mate', moves: 0, bound: 'exact' },
      pv: [],
    });
  });

  it('keeps the MultiPV index', () => {
    expect(parseUciLine('info depth 10 multipv 3 score cp -12 pv g1f3')).toMatchObject({
      multiPv: 3,
    });
  });

  it('accepts promotions in the pv', () => {
    expect(parseUciLine('info depth 5 score cp 900 pv e7e8q d8e8')).toMatchObject({
      pv: ['e7e8q', 'd8e8'],
    });
  });

  it.each([
    'info string NNUE evaluation using nn-37f18f62d772.nnue',
    'info depth 20 currmove e2e4 currmovenumber 1',
    'id name Stockfish 17',
    'option name Hash type spin default 16 min 1 max 33554432',
    'Stockfish 17 by the Stockfish developers',
    '',
  ])('ignores lines it does not use: %j', (line) => {
    expect(parseUciLine(line)).toBeNull();
  });

  it.each([
    'info depth 10 score cp',
    'info depth 10 score pawns 30',
    'info depth 10 score cp abc',
    'info depth 10 score cp 20 pv e2e4 xyz',
  ])('rejects malformed info lines: %j', (line) => {
    expect(parseUciLine(line)).toBeNull();
  });

  it('parses bestmove with and without ponder', () => {
    expect(parseUciLine('bestmove e2e4 ponder e7e5')).toEqual({
      type: 'bestmove',
      move: 'e2e4',
      ponder: 'e7e5',
    });
    expect(parseUciLine('bestmove g7g8n')).toEqual({ type: 'bestmove', move: 'g7g8n' });
  });

  it('reports no move for checkmate or stalemate', () => {
    expect(parseUciLine('bestmove (none)')).toEqual({ type: 'bestmove', move: null });
    expect(parseUciLine('bestmove 0000')).toEqual({ type: 'bestmove', move: null });
  });

  it('rejects malformed bestmove lines', () => {
    expect(parseUciLine('bestmove')).toBeNull();
    expect(parseUciLine('bestmove e2e9')).toBeNull();
  });
});

describe('isUciMove', () => {
  it('accepts long algebraic moves only', () => {
    for (const move of ['e2e4', 'a7a8q', 'h2h1n', 'e1g1']) expect(isUciMove(move)).toBe(true);
    for (const move of ['e4', 'Nf3', 'e2e4k', 'e2-e4', 'i2i4', 'E2E4', 'e2e4 ']) {
      expect(isUciMove(move)).toBe(false);
    }
  });
});

describe('toWhitePerspective', () => {
  const cp = (centipawns: number, bound: EngineScore['bound'] = 'exact'): EngineScore => ({
    kind: 'cp',
    centipawns,
    bound,
  });
  const mate = (moves: number): EngineScore => ({ kind: 'mate', moves, bound: 'exact' });

  it('keeps centipawns when White is to move and negates them when Black is', () => {
    expect(toWhitePerspective(cp(35), 'w')).toEqual({ kind: 'cp', centipawns: 35, bound: 'exact' });
    expect(toWhitePerspective(cp(35), 'b')).toEqual({
      kind: 'cp',
      centipawns: -35,
      bound: 'exact',
    });
    expect(toWhitePerspective(cp(-120), 'b')).toMatchObject({ centipawns: 120 });
  });

  it('never produces -0 for an even position', () => {
    const evaluation = toWhitePerspective(cp(0), 'b');
    expect(evaluation.kind === 'cp' && Object.is(evaluation.centipawns, 0)).toBe(true);
  });

  it('flips bounds along with the sign', () => {
    expect(toWhitePerspective(cp(50, 'lower'), 'b')).toMatchObject({ bound: 'upper' });
    expect(toWhitePerspective(cp(50, 'upper'), 'b')).toMatchObject({ bound: 'lower' });
    expect(toWhitePerspective(cp(50, 'lower'), 'w')).toMatchObject({ bound: 'lower' });
  });

  it('names the side delivering mate', () => {
    expect(toWhitePerspective(mate(3), 'w')).toMatchObject({ winner: 'w', moves: 3 });
    expect(toWhitePerspective(mate(3), 'b')).toMatchObject({ winner: 'b', moves: 3 });
    expect(toWhitePerspective(mate(-2), 'w')).toMatchObject({ winner: 'b', moves: 2 });
    expect(toWhitePerspective(mate(-2), 'b')).toMatchObject({ winner: 'w', moves: 2 });
  });

  it('treats mate 0 as the side to move already being checkmated', () => {
    expect(toWhitePerspective(mate(0), 'w')).toEqual({
      kind: 'mate',
      winner: 'b',
      moves: 0,
      bound: 'exact',
    });
    expect(toWhitePerspective(mate(0), 'b')).toMatchObject({ winner: 'w', moves: 0 });
  });
});
