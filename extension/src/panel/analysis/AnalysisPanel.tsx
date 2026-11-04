import { Fragment } from 'preact';
import { formatEvaluation, pvMoves } from '../../engine/notation';
import type { ConfirmedPosition } from '../../shared/position';
import type { AnalysisState } from './useAnalysis';
import './analysis.css';

/** How much of the engine's line to show. */
const LINE_PLIES = 8;

export interface AnalysisPanelProps {
  readonly position: ConfirmedPosition;
  readonly analysis: AnalysisState;
  readonly targetDepth: number;
  readonly onRetry: () => void;
  /**
   * A move of the engine's line was clicked: `moves` is the whole line shown (engine
   * notation) and `index` the clicked move.
   */
  readonly onPlayLine?: (moves: readonly string[], index: number) => void;
}

export function AnalysisPanel(props: AnalysisPanelProps) {
  return (
    <section class="analysis" aria-label="Engine analysis">
      <h2>Engine analysis</h2>
      <AnalysisBody {...props} />
    </section>
  );
}

function AnalysisBody({
  position,
  analysis,
  targetDepth,
  onRetry,
  onPlayLine,
}: AnalysisPanelProps) {
  switch (analysis.status) {
    case 'idle':
      return null;
    case 'starting':
      return <p class="analysis-status">Starting engine…</p>;
    case 'failed':
      return (
        <div role="alert">
          <p class="analysis-error">Engine unavailable: {analysis.error}</p>
          <button type="button" onClick={onRetry}>
            Retry
          </button>
        </div>
      );
    case 'game-over':
      return (
        <p class="analysis-eval">
          {analysis.outcome.kind === 'checkmate'
            ? `Checkmate: ${analysis.outcome.winner === 'w' ? 'White' : 'Black'} wins`
            : 'Stalemate: draw'}
        </p>
      );
    case 'analyzing':
    case 'done': {
      const { update } = analysis;
      if (!update) return <p class="analysis-status">Analyzing…</p>;
      const line = pvMoves(position, update.pv, LINE_PLIES);
      const ucis = line.map((move) => move.uci);
      return (
        <>
          <p class="analysis-eval">
            <strong>{update.evaluation ? formatEvaluation(update.evaluation) : '…'}</strong>{' '}
            <span class="analysis-note">(White’s perspective)</span>
          </p>
          <p class="analysis-status">
            Depth {update.depth}/{targetDepth}
            {analysis.status === 'done' ? ' · done' : ' · analyzing…'}
          </p>
          {line.length > 0 && (
            <p class="analysis-line">
              {line.map((move, index) => (
                <Fragment key={move.uci + String(index)}>
                  {index > 0 && ' '}
                  {onPlayLine ? (
                    <button
                      type="button"
                      class="line-move"
                      aria-label={`Play ${move.label}`}
                      onClick={() => {
                        onPlayLine(ucis, index);
                      }}
                    >
                      {move.label}
                    </button>
                  ) : (
                    move.label
                  )}
                </Fragment>
              ))}
            </p>
          )}
        </>
      );
    }
  }
}
