// Playing against Stockfish. One rule: while playing, whenever the board is at the end
// of a line and it's Stockfish's turn, Stockfish plays its best move as soon as its
// search of that position has completed. Going back into a game never triggers a move
// (those positions already continue), and playing a different move on one of your turns
// makes a branch that Stockfish then answers.

import { useEffect } from 'preact/hooks';
import type { UciMove } from '../../engine/uci';
import type { ConfirmedPosition, Color } from '../../shared/position';
import type { NodeId } from './moveTree';
import type { CompletedAnalysis } from './useAnalysis';

export interface PlayVsEngineInput {
  readonly playing: Color | null;
  readonly position: ConfirmedPosition | null;
  readonly current: NodeId | null;
  readonly atLineEnd: boolean;
  readonly completed: (position: ConfirmedPosition) => CompletedAnalysis | undefined;
  readonly playEngineMove: (at: NodeId, uci: UciMove) => void;
}

export type PlayStatus = 'your-move' | 'thinking' | 'waiting' | null;

export function usePlayVsEngine({
  playing,
  position,
  current,
  atLineEnd,
  completed,
  playEngineMove,
}: PlayVsEngineInput): PlayStatus {
  const enginesTurn = playing !== null && position !== null && position.sideToMove !== playing;
  const bestMove = enginesTurn && atLineEnd ? (completed(position)?.bestMove ?? null) : null;

  useEffect(() => {
    // playEngineMove re-checks that the board is still on `current`.
    if (bestMove !== null && current !== null) playEngineMove(current, bestMove);
    // Runs again whenever the position or its completed search changes.
  }, [bestMove, current]);

  if (playing === null || position === null) return null;
  if (!enginesTurn) return 'your-move';
  // Stockfish's turn inside an existing line: its move is already on the board ahead.
  return atLineEnd ? 'thinking' : 'waiting';
}
