import { formatEvaluation, pvToSan } from '../../engine/notation';
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
}

export function AnalysisPanel({ position, analysis, targetDepth, onRetry }: AnalysisPanelProps) {
  return (
    <section class="analysis" aria-label="Engine analysis">
      <h2>Engine analysis</h2>
      <AnalysisBody
        position={position}
        analysis={analysis}
        targetDepth={targetDepth}
        onRetry={onRetry}
      />
    </section>
  );
}

function AnalysisBody({ position, analysis, targetDepth, onRetry }: AnalysisPanelProps) {
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
      const line = pvToSan(position, update.pv, LINE_PLIES);
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
          {line && <p class="analysis-line">{line}</p>}
        </>
      );
    }
  }
}
