// Runs the engine on the confirmed position: starts it on first use, replaces or stops
// searches as the position changes, detects a hung engine, and shuts it down on unmount.

import { useEffect, useRef, useState } from 'preact/hooks';
import {
  Engine,
  type AnalysisUpdate,
  type EngineTransport,
  type Search,
} from '../../engine/engine';
import { gameOver, type GameOver } from '../../engine/notation';
import { createStockfishTransport } from '../../engine/stockfishWorker';
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

export interface AnalysisOptions {
  readonly createTransport?: () => EngineTransport;
  readonly depth?: number;
  readonly watchdogMs?: number;
}

export function useAnalysis(
  position: ConfirmedPosition | null,
  {
    createTransport = createStockfishTransport,
    depth = ANALYSIS_DEPTH,
    watchdogMs = WATCHDOG_MS,
  }: AnalysisOptions = {},
): AnalysisState & { readonly retry: () => void } {
  const [state, setState] = useState<AnalysisState>({ status: 'idle' });
  // Bumped by Retry to rerun the analysis effect with a fresh engine.
  const [attempt, setAttempt] = useState(0);
  const engine = useRef<Promise<Engine> | null>(null);
  const makeTransport = useRef(createTransport);
  makeTransport.current = createTransport;

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
    if (!position) {
      setState({ status: 'idle' });
      return;
    }
    const outcome = gameOver(position);
    if (outcome) {
      setState({ status: 'game-over', outcome });
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

    // One async flow with one catch: a failure anywhere (creating the worker, starting
    // the engine, an engine that already died, the search itself) shows the error.
    const run = async () => {
      setState(engine.current ? { status: 'analyzing', update: null } : { status: 'starting' });
      const instance = await getEngine();
      if (cancelled) return;
      setState({ status: 'analyzing', update: null });

      // Any output, including progress lines, proves the engine is alive.
      stopWatchingActivity = instance.onActivity(armWatchdog);
      armWatchdog();
      let latest: AnalysisUpdate | null = null;
      search = instance.analyze(position, { depth }, (update) => {
        if (cancelled || update.multiPv !== 1) return;
        latest = update;
        setState({ status: 'analyzing', update });
      });

      const result = await search.result;
      // Read through a function: the effect's cleanup can set `cancelled` while we wait.
      if (isCancelled() || !result) return;
      cleanup();
      setState({ status: 'done', update: result.last ?? latest });
    };
    run().catch(fail);

    return () => {
      cancelled = true;
      cleanup();
      search?.stop();
    };
  }, [position, attempt, depth, watchdogMs]);

  // Shut the engine down when the panel closes.
  useEffect(() => discardEngine, []);

  return {
    ...state,
    retry: () => {
      discardEngine();
      setAttempt((value) => value + 1);
    },
  };
}
