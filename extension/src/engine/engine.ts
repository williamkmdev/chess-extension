// Typed engine client. The UI calls this; it never sees UCI text, and every score it
// receives is already from White's perspective.
//
// Scheduling: the engine runs at most one search at a time. A new request while a
// search is running sends a single `stop` and waits for that search's `bestmove` before
// sending anything else; only the newest waiting request is ever started. (The
// single-threaded engine reads queued commands while searching, so queuing several
// searches inside it would let one `stop` hit the wrong search.)

import type { Color, ConfirmedPosition } from '../shared/position';
import {
  goCommand,
  IS_READY,
  parseUciLine,
  positionCommand,
  QUIT,
  STOP,
  toWhitePerspective,
  UCI,
  type Evaluation,
  type SearchLimits,
  type UciMove,
} from './uci';

/** How the client talks to an engine process (a Web Worker in the browser). */
export interface EngineTransport {
  send(command: string): void;
  /** Called once by the client to receive output lines and fatal errors. */
  listen(handlers: { line: (line: string) => void; error: (error: Error) => void }): void;
  terminate(): void;
}

export interface AnalysisUpdate {
  readonly depth: number;
  readonly multiPv: number;
  /** White's perspective. Missing on the rare info line that has no score. */
  readonly evaluation?: Evaluation;
  /** Expected line, starting with the engine's best move. */
  readonly pv: readonly UciMove[];
  readonly nodes?: number;
  readonly timeMs?: number;
}

export interface AnalysisResult {
  /** null when the side to move has no legal move (checkmate or stalemate). */
  readonly bestMove: UciMove | null;
  /** The last update of the main line (MultiPV 1), if any arrived. */
  readonly last?: AnalysisUpdate;
  /** True if the search ended because `stop()` was called. */
  readonly stopped: boolean;
}

export interface Search {
  readonly id: number;
  /** Ends the search early; `result` then resolves with what was found so far. */
  stop(): void;
  /**
   * Resolves when the search ends, or with null if it was replaced by a newer search
   * (or stopped before the engine started it).
   */
  readonly result: Promise<AnalysisResult | null>;
}

export class EngineError extends Error {
  override name = 'EngineError';
}

interface SearchState {
  readonly id: number;
  readonly sideToMove: Color;
  readonly commands: readonly [string, string];
  readonly onUpdate: (update: AnalysisUpdate) => void;
  readonly resolve: (result: AnalysisResult | null) => void;
  readonly reject: (error: Error) => void;
  last?: AnalysisUpdate;
  /** `stop` has been sent for this search (each search gets at most one). */
  stopSent: boolean;
  /** The user asked to stop it (as opposed to it being replaced). */
  stopRequested: boolean;
  /** Replaced by a newer search: its output is ignored and it resolves to null. */
  superseded: boolean;
}

interface Waiter {
  readonly reply: 'uciok' | 'readyok';
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
}

const DEFAULT_START_TIMEOUT_MS = 15_000;

export class Engine {
  /** The search the engine is running (its `go` was sent, its `bestmove` hasn't arrived). */
  private running: SearchState | null = null;
  /** The newest request, waiting for the running search to finish. */
  private pending: SearchState | null = null;
  private nextId = 1;
  private failure: Error | null = null;
  private terminated = false;
  private waiters: Waiter[] = [];
  private readonly activityListeners = new Set<() => void>();

  private constructor(private readonly transport: EngineTransport) {
    transport.listen({
      line: (line) => {
        if (this.failure) return;
        for (const listener of this.activityListeners) listener();
        this.handleLine(line);
      },
      error: (error) => {
        this.fail(error);
      },
    });
  }

  /** Starts the engine and completes the UCI handshake. */
  static async start(
    transport: EngineTransport,
    { timeoutMs = DEFAULT_START_TIMEOUT_MS }: { timeoutMs?: number } = {},
  ): Promise<Engine> {
    const engine = new Engine(transport);
    const timer = setTimeout(() => {
      engine.fail(new EngineError(`Engine did not start within ${String(timeoutMs)} ms`));
    }, timeoutMs);
    try {
      await engine.request(UCI, 'uciok');
      await engine.request(IS_READY, 'readyok');
      return engine;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Analyzes a confirmed position, replacing any search still running or waiting: the
   * replaced search resolves to null and none of its output reaches the new one.
   * Throws (without changing anything) if the limits are invalid or the engine failed.
   */
  analyze(
    position: ConfirmedPosition,
    limits: SearchLimits,
    onUpdate: (update: AnalysisUpdate) => void = () => undefined,
  ): Search {
    if (this.failure) throw this.failure;
    // Build (and so validate) the commands before touching any state.
    const commands = [positionCommand(position), goCommand(limits)] as const;

    let search!: SearchState;
    const result = new Promise<AnalysisResult | null>((resolve, reject) => {
      search = {
        id: this.nextId++,
        sideToMove: position.sideToMove,
        commands,
        onUpdate,
        resolve,
        reject,
        stopSent: false,
        stopRequested: false,
        superseded: false,
      };
    });

    // A request that never started is simply dropped.
    this.pending?.resolve(null);
    this.pending = null;

    if (this.running) {
      this.running.superseded = true;
      this.running.resolve(null);
      this.sendStop(this.running);
      this.pending = search;
    } else {
      this.begin(search);
    }

    return {
      id: search.id,
      result,
      stop: () => {
        if (this.pending === search) {
          this.pending = null;
          search.resolve(null);
        } else if (this.running === search) {
          search.stopRequested = true;
          this.sendStop(search);
        }
      },
    };
  }

  /**
   * Calls `listener` whenever the engine produces any output, including progress lines
   * that carry no analysis (e.g. `currmove`). Used to tell a slow search from a hung
   * engine. Returns an unsubscribe function.
   */
  onActivity(listener: () => void): () => void {
    this.activityListeners.add(listener);
    return () => {
      this.activityListeners.delete(listener);
    };
  }

  /** Stops any search and shuts the engine down. Safe to call more than once. */
  dispose(): void {
    if (this.terminated) return;
    this.pending?.resolve(null);
    this.running?.resolve(null);
    this.pending = null;
    this.running = null;
    if (!this.failure) {
      this.failure = new EngineError('Engine was disposed');
      this.transport.send(QUIT);
    }
    this.rejectWaiters(this.failure);
    this.terminate();
  }

  private begin(search: SearchState): void {
    this.running = search;
    for (const command of search.commands) this.transport.send(command);
  }

  private sendStop(search: SearchState): void {
    if (search.stopSent) return;
    search.stopSent = true;
    this.transport.send(STOP);
  }

  private request(command: string, reply: Waiter['reply']): Promise<void> {
    if (this.failure) return Promise.reject(this.failure);
    const done = new Promise<void>((resolve, reject) => {
      this.waiters.push({ reply, resolve, reject });
    });
    this.transport.send(command);
    return done;
  }

  private handleLine(line: string): void {
    if (this.failure) return;
    const message = parseUciLine(line);
    if (!message) return;

    switch (message.type) {
      case 'uciok':
      case 'readyok': {
        const index = this.waiters.findIndex((waiter) => waiter.reply === message.type);
        const [waiter] = index >= 0 ? this.waiters.splice(index, 1) : [];
        waiter?.resolve();
        return;
      }
      case 'info': {
        const search = this.running;
        if (!search || search.superseded || message.depth === undefined) return;
        const update: AnalysisUpdate = {
          depth: message.depth,
          multiPv: message.multiPv,
          ...(message.score && {
            evaluation: toWhitePerspective(message.score, search.sideToMove),
          }),
          pv: message.pv,
          ...(message.nodes !== undefined && { nodes: message.nodes }),
          ...(message.timeMs !== undefined && { timeMs: message.timeMs }),
        };
        if (update.multiPv === 1) search.last = update;
        search.onUpdate(update);
        return;
      }
      case 'bestmove': {
        const search = this.running;
        if (!search) return;
        this.running = null;
        if (!search.superseded) {
          search.resolve({
            bestMove: message.move,
            ...(search.last && { last: search.last }),
            stopped: search.stopRequested,
          });
        }
        // The engine is idle again: start the newest waiting request, if any.
        const next = this.pending;
        this.pending = null;
        if (next) this.begin(next);
        return;
      }
    }
  }

  private fail(error: Error): void {
    if (this.failure) return;
    this.failure = error;
    this.rejectWaiters(error);
    this.running?.reject(error);
    this.pending?.reject(error);
    this.running = null;
    this.pending = null;
    this.terminate();
  }

  private terminate(): void {
    if (this.terminated) return;
    this.terminated = true;
    this.transport.terminate();
  }

  private rejectWaiters(error: Error): void {
    for (const waiter of this.waiters) waiter.reject(error);
    this.waiters = [];
  }
}
