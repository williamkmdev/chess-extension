// Runs the engine on the position being explored: starts it on first use, replaces or
// stops searches as the position changes, detects a hung engine, and shuts it down on
// unmount. Completed searches are remembered, and the position before the last move is
// also searched (after the current one) so the move can be compared with the engine's
// choice there.

import { useEffect, useRef, useState } from 'preact/hooks';
import {
  Engine,
  type AnalysisUpdate,
  type EngineTransport,
  type Search,
} from '../../engine/engine';
import { gameOver, type GameOver } from '../../engine/notation';
import { createStockfishTransport } from '../../engine/stockfishWorker';
import type { UciMove } from '../../engine/uci';
import { toFen } from '../../shared/fen';
import type { ConfirmedPosition } from '../../shared/position';

export const ANALYSIS_DEPTH = 20;
/**
 * A running search whose engine produces no output at all (not even progress lines)
 * for this long is treated as hung. Generous on purpose: wrongly killing a slow but
 * healthy search is worse than noticing a dead engine a little later.
 */
export const WATCHDOG_MS = 30_000;

export type AnalysisState =
  | { readonly status: 'idle' }
  | { readonly status: 'starting' }
  | { readonly status: 'analyzing'; readonly update: AnalysisUpdate | null }
  | { readonly status: 'done'; readonly update: AnalysisUpdate | null }
  | { readonly status: 'game-over'; readonly outcome: GameOver }
  | { readonly status: 'failed'; readonly error: string };

/** A search that ran to the full depth (never one stopped early). */
export interface CompletedAnalysis {
  readonly update: AnalysisUpdate | null;
  readonly bestMove: UciMove | null;
}

export interface AnalysisOptions {
  readonly createTransport?: () => EngineTransport;
  readonly depth?: number;
  readonly watchdogMs?: number;
}

export function useAnalysis(
  position: ConfirmedPosition | null,
  /** The position before the move that led to `position`, if any: searched afterwards. */
  previous: ConfirmedPosition | null,
  {
    createTransport = createStockfishTransport,
    depth = ANALYSIS_DEPTH,
    watchdogMs = WATCHDOG_MS,
  }: AnalysisOptions = {},
): AnalysisState & {
  readonly retry: () => void;
  /** The completed search of a position, if there has been one. */
  readonly completed: (position: ConfirmedPosition) => CompletedAnalysis | undefined;
} {
  // Tagged with the position it describes: when the position changes, the old result
  // must not be shown against the new board, not even for the render before the effect
  // below restarts the analysis.
  const [tagged, setTagged] = useState<{
    readonly position: ConfirmedPosition | null;
    readonly state: AnalysisState;
  }>({ position: null, state: { status: 'idle' } });
  const state: AnalysisState =
    tagged.position === position
      ? tagged.state
      : position
        ? { status: 'analyzing', update: null }
        : { status: 'idle' };
  // Bumped by Retry to rerun the analysis effect with a fresh engine.
  const [attempt, setAttempt] = useState(0);
  // Bumped when a background search (of `previous`) completes, to show its result.
  const [, setCompletedCount] = useState(0);
  const engine = useRef<Promise<Engine> | null>(null);
  const cache = useRef(new Map<string, CompletedAnalysis>());
  const makeTransport = useRef(createTransport);
  makeTransport.current = createTransport;

  // Results only count for the depth they were searched to.
  const cacheKey = (target: ConfirmedPosition) => `${String(depth)} ${toFen(target)}`;

  const getEngine = (): Promise<Engine> => {
    engine.current ??= Engine.start(makeTransport.current());
    return engine.current;
  };

  const discardEngine = () => {
    const current = engine.current;
    engine.current = null;
    current?.then(
      (instance) => {
        instance.dispose();
      },
      () => undefined,
    );
  };

  useEffect(() => {
    const setState = (next: AnalysisState) => {
      setTagged({ position, state: next });
    };
    if (!position) {
      setState({ status: 'idle' });
      return;
    }

    let cancelled = false;
    let search: Search | null = null;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    let stopWatchingActivity: (() => void) | undefined;
    const isCancelled = () => cancelled;

    const cleanup = () => {
      clearTimeout(watchdog);
      stopWatchingActivity?.();
      stopWatchingActivity = undefined;
    };
    const fail = (error: unknown) => {
      if (cancelled) return;
      cancelled = true;
      cleanup();
      discardEngine();
      setState({
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
    };
    const armWatchdog = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => {
        fail(new Error('The engine stopped responding.'));
      }, watchdogMs);
    };

    /**
     * Searches `target` to the full depth and remembers the result. Resolves to null if
     * this effect was cancelled (or the search replaced) before it finished.
     */
    const searchToCompletion = async (
      instance: Engine,
      target: ConfirmedPosition,
      onUpdate: (update: AnalysisUpdate) => void = () => undefined,
    ): Promise<CompletedAnalysis | null> => {
      // Any output, including progress lines, proves the engine is alive.
      stopWatchingActivity = instance.onActivity(armWatchdog);
      armWatchdog();
      let latest: AnalysisUpdate | null = null;
      search = instance.analyze(target, { depth }, (update) => {
        if (cancelled || update.multiPv !== 1) return;
        latest = update;
        onUpdate(update);
      });
      const result = await search.result;
      // Read through a function: the effect's cleanup can set `cancelled` while we wait.
      if (isCancelled() || !result) return null;
      cleanup();
      const completed = { update: result.last ?? latest, bestMove: result.bestMove };
      if (!result.stopped) cache.current.set(cacheKey(target), completed);
      return completed;
    };

    const needsSearch = (target: ConfirmedPosition) =>
      !gameOver(target) && !cache.current.has(cacheKey(target));

    // One async flow with one catch: a failure anywhere (creating the worker, starting
    // the engine, an engine that already died, a search) shows the error.
    const run = async () => {
      const outcome = gameOver(position);
      const known = cache.current.get(cacheKey(position));
      if (outcome) {
        setState({ status: 'game-over', outcome });
      } else if (known) {
        setState({ status: 'done', update: known.update });
      } else {
        setState(engine.current ? { status: 'analyzing', update: null } : { status: 'starting' });
        const instance = await getEngine();
        if (cancelled) return;
        setState({ status: 'analyzing', update: null });
        const completed = await searchToCompletion(instance, position, (update) => {
          setState({ status: 'analyzing', update });
        });
        if (!completed) return;
        setState({ status: 'done', update: completed.update });
      }

      // Then the position before the move, for the comparison with the engine's choice.
      if (previous && needsSearch(previous)) {
        const instance = await getEngine();
        if (isCancelled()) return;
        const completed = await searchToCompletion(instance, previous);
        if (!completed) return;
        setCompletedCount((count) => count + 1);
      }
    };
    run().catch(fail);

    return () => {
      cancelled = true;
      cleanup();
      search?.stop();
    };
  }, [position, previous, attempt, depth, watchdogMs]);

  // Shut the engine down when the panel closes.
  useEffect(() => discardEngine, []);

  return {
    ...state,
    retry: () => {
      discardEngine();
      setAttempt((value) => value + 1);
    },
    completed: (target) => cache.current.get(cacheKey(target)),
  };
}
