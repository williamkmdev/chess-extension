// Runs the real bundled Stockfish build (the same lite single-threaded file the extension
// ships) under Node, to check the client and parser against genuine engine output.

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { confirmPosition } from '../shared/confirm';
import { parseFen } from '../shared/fen';
import type { ConfirmedPosition } from '../shared/position';
import { Engine, type AnalysisUpdate, type EngineTransport } from './engine';

interface NodeStockfish {
  processCommand(command: string): void;
  terminate(): void;
}

const require = createRequire(import.meta.url);
const initStockfish = require('stockfish') as (
  enginePath: string,
  onLine: (line: string) => void,
) => NodeStockfish;
const ENGINE_PATH = fileURLToPath(
  new URL('../../node_modules/stockfish/bin/stockfish-19-lite-single.js', import.meta.url),
);

function nodeTransport(): EngineTransport {
  let onLine: (line: string) => void = () => undefined;
  const stockfish = initStockfish(ENGINE_PATH, (line) => {
    onLine(line);
  });
  return {
    send: (command) => {
      stockfish.processCommand(command);
    },
    listen: ({ line }) => {
      onLine = line;
    },
    terminate: () => {
      stockfish.terminate();
    },
  };
}

function confirmed(fen: string): ConfirmedPosition {
  const parsed = parseFen(fen);
  if (!parsed.ok) throw new Error('bad FEN');
  const result = confirmPosition(parsed.position);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.position;
}

describe('real Stockfish (lite, single-threaded)', () => {
  it('analyzes, finds mates, and replaces searches', { timeout: 30_000 }, async () => {
    const engine = await Engine.start(nodeTransport());
    try {
      // A normal position: a legal best move and a sane centipawn score.
      const updates: AnalysisUpdate[] = [];
      const start = await engine.analyze(
        confirmed('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'),
        { depth: 8 },
        (update) => updates.push(update),
      ).result;
      expect(start?.bestMove).toMatch(/^[a-h][1-8][a-h][1-8]$/);
      expect(start?.last?.depth).toBe(8);
      expect(start?.last?.evaluation).toMatchObject({ kind: 'cp' });
      expect(
        Math.abs(start?.last?.evaluation?.kind === 'cp' ? start.last.evaluation.centipawns : 999),
      ).toBeLessThan(150);
      expect(updates.length).toBeGreaterThan(0);

      // Black to move and mates in one (Qh4#): reported as a White-perspective mate for Black.
      const mateForBlack = await engine.analyze(
        confirmed('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2'),
        { depth: 6 },
      ).result;
      expect(mateForBlack?.bestMove).toBe('d8h4');
      expect(mateForBlack?.last?.evaluation).toEqual({
        kind: 'mate',
        winner: 'b',
        moves: 1,
        bound: 'exact',
      });

      // Checkmated position: no best move.
      const mated = await engine.analyze(confirmed('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1'), {
        depth: 4,
      }).result;
      expect(mated?.bestMove).toBeNull();

      // Replacing a long search: the first resolves null, the second completes.
      const long = engine.analyze(
        confirmed('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'),
        {},
      );
      const quick = engine.analyze(confirmed('4k3/8/8/8/8/8/8/R3K3 w Q - 0 1'), { depth: 6 });
      expect(await long.result).toBeNull();
      expect((await quick.result)?.bestMove).toMatch(/^[a-h][1-8][a-h][1-8]$/);

      // Several rapid replacements of unlimited searches: the newest must still finish.
      const burst = [
        engine.analyze(confirmed('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'), {}),
        engine.analyze(confirmed('4k3/8/8/8/8/8/8/R3K3 w Q - 0 1'), {}),
        engine.analyze(confirmed('4k3/8/8/8/8/8/8/R3K3 b Q - 0 1'), {}),
        engine.analyze(confirmed('4k3/8/8/8/8/8/8/R3K3 w Q - 0 1'), { depth: 6 }),
      ];
      const burstResults = await Promise.all(burst.map((search) => search.result));
      expect(burstResults.slice(0, 3)).toEqual([null, null, null]);
      expect(burstResults[3]?.bestMove).toMatch(/^[a-h][1-8][a-h][1-8]$/);
    } finally {
      engine.dispose();
    }
  });
});
