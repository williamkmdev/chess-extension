// Comparing a move the player tried with the engine's choice in the same position.
//
// Inputs are two complete searches: the position before the move (whose score is the
// score of the engine's best move) and the position after the played move. Both scores
// are from White's perspective; here they're turned into the mover's point of view,
// with mate distances counted from the position before the move, so the two are
// directly comparable. Centipawns and mates are never mixed.

import type { Color } from '../shared/position';
import type { Evaluation } from './uci';

export type MoveComparison =
  /** The played move is the engine's choice. */
  | { readonly kind: 'best-move' }
  /** No measurable difference (or the played move even scored a little higher). */
  | { readonly kind: 'as-good' }
  /** Both are ordinary scores; the played move is this many pawns worse for the mover. */
  | { readonly kind: 'worse'; readonly pawns: number }
  /** The engine's choice mates in `moves`; the played move doesn't force mate. */
  | { readonly kind: 'misses-mate'; readonly moves: number }
  /** Both mate, the played move more slowly. */
  | { readonly kind: 'slower-mate'; readonly moves: number; readonly bestMoves: number }
  /**
   * After the played move the opponent mates in `moves`. `bestMoves` is set when the
   * mover gets mated even after the engine's choice, only later.
   */
  | { readonly kind: 'allows-mate'; readonly moves: number; readonly bestMoves?: number };

/** A score from the mover's point of view, mate distances in moves from before the move. */
type Outcome =
  | { readonly kind: 'mates'; readonly moves: number }
  | { readonly kind: 'cp'; readonly centipawns: number }
  | { readonly kind: 'mated'; readonly moves: number };

/**
 * `afterMove`: the evaluation is of the position after the mover's move, so a mate by
 * the mover takes one more of the mover's moves when counted from before it.
 */
function outcome(evaluation: Evaluation, mover: Color, afterMove: boolean): Outcome {
  if (evaluation.kind === 'cp') {
    return {
      kind: 'cp',
      centipawns: mover === 'w' ? evaluation.centipawns : -evaluation.centipawns,
    };
  }
  if (evaluation.winner === mover) {
    return { kind: 'mates', moves: evaluation.moves + (afterMove ? 1 : 0) };
  }
  return { kind: 'mated', moves: evaluation.moves };
}

export interface CompareInput {
  /** Evaluation of the position before the move: the score of the engine's choice. */
  readonly best: Evaluation;
  /** Evaluation of the position after the played move. */
  readonly played: Evaluation;
  /** The side that made the move. */
  readonly mover: Color;
  /** The played move is the engine's best move. */
  readonly isBestMove: boolean;
}

export function compareMove({ best, played, mover, isBestMove }: CompareInput): MoveComparison {
  if (isBestMove) return { kind: 'best-move' };
  const b = outcome(best, mover, false);
  const p = outcome(played, mover, true);

  switch (b.kind) {
    case 'mates':
      if (p.kind !== 'mates') return { kind: 'misses-mate', moves: b.moves };
      return p.moves <= b.moves
        ? { kind: 'as-good' }
        : { kind: 'slower-mate', moves: p.moves, bestMoves: b.moves };
    case 'cp':
      if (p.kind === 'mates') return { kind: 'as-good' };
      if (p.kind === 'mated') return { kind: 'allows-mate', moves: p.moves };
      return worse(b.centipawns - p.centipawns);
    case 'mated':
      // Mated either way: only a quicker mate is worse.
      if (p.kind !== 'mated' || p.moves >= b.moves) return { kind: 'as-good' };
      return { kind: 'allows-mate', moves: p.moves, bestMoves: b.moves };
  }
}

function worse(centipawns: number): MoveComparison {
  // Below a hundredth of a pawn (or negative, from search noise) there is nothing to show.
  const pawns = Math.round(centipawns) / 100;
  return pawns >= 0.01 ? { kind: 'worse', pawns } : { kind: 'as-good' };
}

const COLOR_NAME: Readonly<Record<Color, string>> = { w: 'White', b: 'Black' };

/** e.g. "Nf6 is 0.45 pawns worse for Black than Stockfish’s choice." */
export function describeComparison(comparison: MoveComparison, san: string, mover: Color): string {
  switch (comparison.kind) {
    case 'best-move':
      return `${san} is Stockfish’s choice.`;
    case 'as-good':
      return `${san} is as good as Stockfish’s choice.`;
    case 'worse': {
      const pawns = comparison.pawns.toFixed(2);
      const unit = pawns === '1.00' ? 'pawn' : 'pawns';
      return `${san} is ${pawns} ${unit} worse for ${COLOR_NAME[mover]} than Stockfish’s choice.`;
    }
    case 'misses-mate':
      return `${san} misses mate in ${String(comparison.moves)}.`;
    case 'slower-mate':
      return `${san} mates in ${String(comparison.moves)} instead of ${String(comparison.bestMoves)}.`;
    case 'allows-mate':
      return comparison.bestMoves === undefined
        ? `${san} allows mate in ${String(comparison.moves)}.`
        : `${san} allows mate in ${String(comparison.moves)}; Stockfish’s choice holds out until mate in ${String(comparison.bestMoves)}.`;
  }
}
