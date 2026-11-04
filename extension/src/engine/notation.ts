// Turning engine output into text for people: evaluations and move lines.

import { Chess } from 'chess.js';
import { toFen } from '../shared/fen';
import type { Color, ConfirmedPosition } from '../shared/position';
import type { Evaluation, UciMove } from './uci';

const COLOR_NAME: Readonly<Record<Color, string>> = { w: 'White', b: 'Black' };
const MINUS = '−';

/**
 * e.g. "+0.35", "−1.20", "0.00", "Mate in 3 for White", "≥ +0.50" (White's perspective).
 * Centipawns and mates are always presented differently.
 */
export function formatEvaluation(evaluation: Evaluation): string {
  const bound = evaluation.bound === 'lower' ? '≥ ' : evaluation.bound === 'upper' ? '≤ ' : '';
  if (evaluation.kind === 'mate') {
    const winner = COLOR_NAME[evaluation.winner];
    if (evaluation.moves === 0) return `Checkmate: ${winner} wins`;
    return `${bound}Mate in ${String(evaluation.moves)} for ${winner}`;
  }
  const pawns = (Math.abs(evaluation.centipawns) / 100).toFixed(2);
  if (pawns === '0.00') return `${bound}0.00`;
  return `${bound}${evaluation.centipawns > 0 ? '+' : MINUS}${pawns}`;
}

function load(position: ConfirmedPosition): Chess {
  // The position is already validated by confirmPosition.
  return new Chess(toFen(position), { skipValidation: true });
}

export interface LineMove {
  /** The move in engine notation, e.g. "e2e4". */
  readonly uci: UciMove;
  /** How it reads in the line: "1. e4", "e5", or "12... Qh4#" for a first Black move. */
  readonly label: string;
}

/**
 * The engine's line as numbered moves in standard notation. Stops at the first move
 * that isn't legal, so a malformed line can never be shown as if it were real.
 */
export function pvMoves(
  position: ConfirmedPosition,
  moves: readonly UciMove[],
  maxPlies = moves.length,
): LineMove[] {
  const chess = load(position);
  let moveNumber = position.fullmoveNumber.value;
  let color = position.sideToMove;
  const line: LineMove[] = [];

  for (const uci of moves.slice(0, maxPlies)) {
    let san: string;
    try {
      const promotion = uci.length === 5 ? uci[4] : undefined;
      san = chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        ...(promotion !== undefined && { promotion }),
      }).san;
    } catch {
      break;
    }
    let label = san;
    if (color === 'w') label = `${String(moveNumber)}. ${san}`;
    else if (line.length === 0) label = `${String(moveNumber)}... ${san}`;
    line.push({ uci, label });
    if (color === 'b') moveNumber += 1;
    color = color === 'w' ? 'b' : 'w';
  }
  return line;
}

/** The engine's line as text, e.g. "1. e4 e5 2. Nf3" or "12... Qh4#". */
export function pvToSan(
  position: ConfirmedPosition,
  moves: readonly UciMove[],
  maxPlies = moves.length,
): string {
  return pvMoves(position, moves, maxPlies)
    .map((move) => move.label)
    .join(' ');
}

export type GameOver =
  { readonly kind: 'checkmate'; readonly winner: Color } | { readonly kind: 'stalemate' };

/** Positions with no legal moves, where there's nothing for the engine to search. */
export function gameOver(position: ConfirmedPosition): GameOver | null {
  const chess = load(position);
  if (chess.isCheckmate()) {
    return { kind: 'checkmate', winner: position.sideToMove === 'w' ? 'b' : 'w' };
  }
  if (chess.isStalemate()) return { kind: 'stalemate' };
  return null;
}
