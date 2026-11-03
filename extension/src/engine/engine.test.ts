import { afterEach, describe, expect, it, vi } from 'vitest';
import { Engine, EngineError, type AnalysisUpdate } from './engine';
import { confirmed, FakeTransport } from './testing';

const START = confirmed('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
const BLACK_TO_MOVE = confirmed('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');

async function startEngine() {
  const transport = new FakeTransport();
  const engine = await Engine.start(transport);
  return { transport, engine };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Engine.start', () => {
  it('completes the UCI handshake', async () => {
    const { transport } = await startEngine();
    expect(transport.sent).toEqual(['uci', 'isready']);
  });

  it('fails and terminates the worker if it reports an error while starting', async () => {
    const transport = new FakeTransport();
    transport.autoHandshake = false;
    const starting = Engine.start(transport);
    transport.crash('wasm failed to load');
    await expect(starting).rejects.toThrow('wasm failed to load');
    expect(transport.terminated).toBe(true);
  });

  it('times out if the engine never answers', async () => {
    vi.useFakeTimers();
    const transport = new FakeTransport();
    transport.autoHandshake = false;
    const starting = Engine.start(transport, { timeoutMs: 1000 });
    const assertion = expect(starting).rejects.toThrow(EngineError);
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(transport.terminated).toBe(true);
  });
});

describe('analyze', () => {
  it('sends the confirmed position and search limits', async () => {
    const { transport, engine } = await startEngine();
    engine.analyze(START, { depth: 12 });
    expect(transport.searchCommands).toEqual([
      'position fen rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      'go depth 12',
    ]);
  });

  it('streams updates and resolves with the best move', async () => {
    const { transport, engine } = await startEngine();
    const updates: AnalysisUpdate[] = [];
    const search = engine.analyze(START, { depth: 2 }, (update) => updates.push(update));
    transport.emit(
      'info string NNUE evaluation using nn-37f18f62d772.nnue',
      'info depth 1 seldepth 2 multipv 1 score cp 18 nodes 20 time 1 pv e2e4',
      'info depth 2 seldepth 3 multipv 1 score cp 31 nodes 120 time 2 pv e2e4 e7e5',
      'bestmove e2e4 ponder e7e5',
    );
    const result = await search.result;
    expect(updates.map((update) => update.depth)).toEqual([1, 2]);
    expect(updates[1]).toEqual({
      depth: 2,
      multiPv: 1,
      evaluation: { kind: 'cp', centipawns: 31, bound: 'exact' },
      pv: ['e2e4', 'e7e5'],
      nodes: 120,
      timeMs: 2,
    });
    expect(result).toEqual({ bestMove: 'e2e4', last: updates[1], stopped: false });
  });

  it("reports scores from White's perspective when Black is to move", async () => {
    const { transport, engine } = await startEngine();
    const updates: AnalysisUpdate[] = [];
    const search = engine.analyze(BLACK_TO_MOVE, { depth: 3 }, (update) => updates.push(update));
    transport.emit(
      'info depth 3 score cp 40 pv c7c5',
      'info depth 3 score mate -4 pv d7d6',
      'bestmove c7c5',
    );
    await search.result;
    expect(updates[0]?.evaluation).toEqual({ kind: 'cp', centipawns: -40, bound: 'exact' });
    expect(updates[1]?.evaluation).toEqual({ kind: 'mate', winner: 'w', moves: 4, bound: 'exact' });
  });

  it('keeps the main line as the result when several lines are analyzed', async () => {
    const { transport, engine } = await startEngine();
    const search = engine.analyze(START, { depth: 1 });
    transport.emit(
      'info depth 1 multipv 1 score cp 30 pv e2e4',
      'info depth 1 multipv 2 score cp 20 pv d2d4',
      'bestmove e2e4',
    );
    expect((await search.result)?.last?.pv).toEqual(['e2e4']);
  });

  it('reports no best move in a checkmated position', async () => {
    const { transport, engine } = await startEngine();
    const mated = confirmed('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1');
    const updates: AnalysisUpdate[] = [];
    const search = engine.analyze(mated, { depth: 5 }, (update) => updates.push(update));
    transport.emit('info depth 0 score mate 0', 'bestmove (none)');
    expect(await search.result).toMatchObject({ bestMove: null });
    expect(updates[0]?.evaluation).toEqual({ kind: 'mate', winner: 'w', moves: 0, bound: 'exact' });
  });

  it('stops on request and marks the result as stopped', async () => {
    const { transport, engine } = await startEngine();
    const search = engine.analyze(START, {});
    expect(transport.searchCommands.at(-1)).toBe('go infinite');
    search.stop();
    search.stop();
    expect(transport.searchCommands.filter((command) => command === 'stop')).toHaveLength(1);
    transport.emit('info depth 14 score cp 25 pv d2d4', 'bestmove d2d4');
    expect(await search.result).toMatchObject({ bestMove: 'd2d4', stopped: true });
  });
});

describe('replacing a running search', () => {
  it('waits for the old search to end, then starts the new one', async () => {
    const { transport, engine } = await startEngine();
    const oldUpdates: AnalysisUpdate[] = [];
    const newUpdates: AnalysisUpdate[] = [];
    const first = engine.analyze(START, {}, (update) => oldUpdates.push(update));
    transport.emit('info depth 10 score cp 30 pv e2e4');

    const second = engine.analyze(BLACK_TO_MOVE, { depth: 5 }, (update) => newUpdates.push(update));
    // Only a stop goes out; the new search waits for the old one's bestmove.
    expect(transport.searchCommands.slice(-1)).toEqual(['stop']);
    expect(await first.result).toBeNull();

    transport.emit('info depth 11 score cp 33 pv e2e4', 'bestmove e2e4');
    expect(transport.searchCommands.slice(-2)).toEqual([
      'position fen rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      'go depth 5',
    ]);
    transport.emit('info depth 5 score cp -20 pv e7e5', 'bestmove e7e5');

    expect(oldUpdates.map((update) => update.depth)).toEqual([10]);
    expect(newUpdates).toHaveLength(1);
    expect(newUpdates[0]?.evaluation).toMatchObject({ centipawns: 20 });
    expect(await second.result).toMatchObject({ bestMove: 'e7e5' });
  });

  it('sends one stop per search and starts only the newest request', async () => {
    const { transport, engine } = await startEngine();
    const searches = [START, BLACK_TO_MOVE, START].map((position) => engine.analyze(position, {}));
    // The middle request never reaches the engine.
    expect(transport.searchCommands).toEqual([
      'position fen rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      'go infinite',
      'stop',
    ]);
    expect(await searches[1]?.result).toBeNull();

    transport.emit('bestmove e2e4');
    expect(transport.searchCommands.slice(3)).toEqual([
      'position fen rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      'go infinite',
    ]);
    searches[2]?.stop();
    transport.emit('info depth 3 score cp 25 pv d2d4', 'bestmove d2d4');
    const results = await Promise.all(searches.map((search) => search.result));
    expect(results[0]).toBeNull();
    expect(results[2]).toMatchObject({ bestMove: 'd2d4', stopped: true, last: { pv: ['d2d4'] } });
    expect(transport.searchCommands.filter((command) => command === 'stop')).toHaveLength(2);
  });

  it('does not send a second stop when a stopped search is then replaced', async () => {
    const { transport, engine } = await startEngine();
    const first = engine.analyze(START, {});
    first.stop();
    const second = engine.analyze(START, { depth: 2 });
    expect(transport.searchCommands.filter((command) => command === 'stop')).toHaveLength(1);
    transport.emit('bestmove e2e4', 'info depth 2 score cp 30 pv g1f3', 'bestmove g1f3');
    expect(await first.result).toBeNull();
    expect(await second.result).toMatchObject({ bestMove: 'g1f3' });
  });

  it('copes with a search that had already finished when it was replaced', async () => {
    const { transport, engine } = await startEngine();
    const first = engine.analyze(START, { depth: 1 });
    // Its bestmove is still in flight when the next search is requested.
    const second = engine.analyze(START, { depth: 2 });
    transport.emit('bestmove e2e4', 'info depth 2 score cp 30 pv g1f3', 'bestmove g1f3');
    expect(await first.result).toBeNull();
    expect(await second.result).toMatchObject({ bestMove: 'g1f3' });
  });

  it('drops a waiting request that is stopped before it starts', async () => {
    const { transport, engine } = await startEngine();
    engine.analyze(START, {});
    const waiting = engine.analyze(BLACK_TO_MOVE, {});
    waiting.stop();
    expect(await waiting.result).toBeNull();
    transport.emit('bestmove e2e4');
    // Nothing new was started.
    expect(transport.searchCommands.filter((command) => command.startsWith('go'))).toHaveLength(1);
  });
});

describe('invalid requests', () => {
  it('rejects invalid limits without disturbing the running search', async () => {
    const { transport, engine } = await startEngine();
    const running = engine.analyze(START, { depth: 3 });
    const sentBefore = transport.sent.length;
    expect(() => engine.analyze(START, { depth: 0 })).toThrow(RangeError);
    expect(transport.sent).toHaveLength(sentBefore);
    transport.emit('info depth 3 score cp 20 pv e2e4', 'bestmove e2e4');
    expect(await running.result).toMatchObject({ bestMove: 'e2e4' });
    // And the engine keeps working afterwards.
    const next = engine.analyze(START, { depth: 1 });
    transport.emit('bestmove d2d4');
    expect(await next.result).toMatchObject({ bestMove: 'd2d4' });
  });
});

describe('failures and shutdown', () => {
  it('rejects running and waiting searches, terminates the worker, and refuses new ones', async () => {
    const { transport, engine } = await startEngine();
    const running = engine.analyze(START, {});
    const waiting = engine.analyze(BLACK_TO_MOVE, {});
    transport.crash('out of memory');
    await expect(waiting.result).rejects.toThrow('out of memory');
    expect(await running.result).toBeNull();
    expect(transport.terminated).toBe(true);
    expect(() => engine.analyze(START, {})).toThrow('out of memory');
    engine.dispose();
  });

  it('dispose quits, terminates and resolves searches with null', async () => {
    const { transport, engine } = await startEngine();
    const running = engine.analyze(START, {});
    const waiting = engine.analyze(BLACK_TO_MOVE, {});
    engine.dispose();
    expect(transport.sent.at(-1)).toBe('quit');
    expect(transport.terminated).toBe(true);
    expect(await running.result).toBeNull();
    expect(await waiting.result).toBeNull();
    expect(() => engine.analyze(START, {})).toThrow(EngineError);
    engine.dispose();
  });
});

describe('onActivity', () => {
  it('fires for every line, including ones without analysis, until unsubscribed', async () => {
    const { transport, engine } = await startEngine();
    const listener = vi.fn();
    const unsubscribe = engine.onActivity(listener);
    engine.analyze(START, {});
    transport.emit('info depth 20 currmove e2e4 currmovenumber 1', 'info string hello');
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    transport.emit('info depth 20 currmove d2d4 currmovenumber 2');
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
