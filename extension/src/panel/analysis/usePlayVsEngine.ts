// Playing against Stockfish. While playing, when it's Stockfish's turn, Stockfish plays
// its best move as soon as its search of the position has completed, if the board is at
// the end of a line or Stockfish owes this move a reply: you just made the move (even one
// already in the tree), or asked Stockfish to move first here. Inside an existing line
// its move is followed if it's already there, and otherwise starts a branch. Only
// navigating back into a game never triggers a move.

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
  /** Stockfish owes the current move a reply, even inside an existing line. */
  readonly replyDue: boolean;
  readonly completed: (position: ConfirmedPosition) => CompletedAnalysis | undefined;
  readonly playEngineMove: (at: NodeId, uci: UciMove) => void;
}

export type PlayStatus = 'your-move' | 'thinking' | 'waiting' | null;

export function usePlayVsEngine({
  playing,
  position,
  current,
  atLineEnd,
  replyDue,
  completed,
  playEngineMove,
}: PlayVsEngineInput): PlayStatus {
  const enginesTurn = playing !== null && position !== null && position.sideToMove !== playing;
  const toPlay = enginesTurn && (atLineEnd || replyDue);
  const bestMove = toPlay ? (completed(position)?.bestMove ?? null) : null;

  useEffect(() => {
    // playEngineMove re-checks that the board is still on `current`.
    if (bestMove !== null && current !== null) playEngineMove(current, bestMove);
    // Runs again whenever the position or its completed search changes.
  }, [bestMove, current]);

  if (playing === null || position === null) return null;
  if (!enginesTurn) return 'your-move';
  // Stockfish's turn inside a line you navigated to: its move is already on the board ahead.
  return toPlay ? 'thinking' : 'waiting';
}
