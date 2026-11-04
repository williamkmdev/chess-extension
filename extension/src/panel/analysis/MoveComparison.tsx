import { compareMove, describeComparison } from '../../engine/compare';
import { formatEvaluation, gameOver, pvToSan } from '../../engine/notation';
import type { Evaluation } from '../../engine/uci';
import type { ConfirmedPosition } from '../../shared/position';
import type { PlayedMove } from './moveTree';
import type { CompletedAnalysis } from './useAnalysis';

export interface MoveComparisonProps {
  /** The move the player tried. */
  readonly move: PlayedMove;
  readonly before: ConfirmedPosition;
  readonly after: ConfirmedPosition;
  /** Completed searches; undefined while still to come. */
  readonly beforeResult: CompletedAnalysis | undefined;
  readonly afterResult: CompletedAnalysis | undefined;
}

/** The position's value as far as the comparison is concerned (White's perspective). */
function evaluationOf(
  position: ConfirmedPosition,
  result: CompletedAnalysis | undefined,
): Evaluation | undefined {
  const outcome = gameOver(position);
  if (outcome?.kind === 'checkmate') {
    return { kind: 'mate', winner: outcome.winner, moves: 0, bound: 'exact' };
  }
  if (outcome?.kind === 'stalemate') return { kind: 'cp', centipawns: 0, bound: 'exact' };
  return result?.update?.evaluation;
}

/**
 * How the move that led to this position compares with Stockfish's choice in the
 * position before it. Labelled as Stockfish's choice: a screenshot can't tell us what
 * the player in the video actually played.
 */
export function MoveComparison({
  move,
  before,
  after,
  beforeResult,
  afterResult,
}: MoveComparisonProps) {
  const played = evaluationOf(after, afterResult);
  const best = beforeResult?.update?.evaluation;
  const bestMove = beforeResult?.bestMove;

  let body;
  if (!played) {
    body = <p class="analysis-status">Comparing… (analyzing the position after your move)</p>;
  } else if (!best || !bestMove) {
    body = <p class="analysis-status">Comparing… (analyzing the position before your move)</p>;
  } else {
    const comparison = compareMove({
      best,
      played,
      mover: move.color,
      isBestMove: bestMove === move.uci,
    });
    body = (
      <>
        <p>
          Your move: <strong>{pvToSan(before, [move.uci])}</strong> {formatEvaluation(played)}
        </p>
        <p>
          Stockfish’s choice: <strong>{pvToSan(before, [bestMove])}</strong>{' '}
          {formatEvaluation(best)}
        </p>
        <p class="comparison-verdict">{describeComparison(comparison, move.san, move.color)}</p>
        <p class="analysis-note">Scores are from White’s perspective.</p>
      </>
    );
  }

  return (
    <section class="analysis comparison" aria-label="Compared with Stockfish">
      <h2>Compared with Stockfish</h2>
      {body}
    </section>
  );
}
