// Exploring a confirmed position: which move of the tree is on the board, which piece
// is picked up, and a promotion waiting for its piece. Only legal moves are played.

import { useMemo, useState } from 'preact/hooks';
import { movePiece } from '../../shared/editing';
import type { Board, ConfirmedPosition, Square } from '../../shared/position';
import { findTarget, legalMoves, toUci, type LegalMoves, type PromotionPiece } from './legalMoves';
import {
  createTree,
  getNode,
  playMove,
  stepBack,
  stepForward,
  type MoveNode,
  type MoveTree,
  type NodeId,
} from './moveTree';

interface ExplorerState {
  readonly tree: MoveTree;
  readonly current: NodeId;
  /** The piece picked up by clicking it. */
  readonly selected: Square | null;
  /** A pawn move to the last rank, waiting for the player to choose a piece. */
  readonly promotion: { readonly from: Square; readonly to: Square } | null;
}

const NO_MOVES: LegalMoves = new Map();

export function useExplorer() {
  const [state, setState] = useState<ExplorerState | null>(null);
  const node: MoveNode | null = state ? getNode(state.tree, state.current) : null;
  const position = node?.position ?? null;
  const moves = useMemo(() => (position ? legalMoves(position) : NO_MOVES), [position]);

  const goTo = (current: ExplorerState, id: NodeId | null) => {
    if (id === null) return;
    setState({ ...current, current: id, selected: null, promotion: null });
  };

  const play = (current: ExplorerState, uci: string) => {
    const result = playMove(current.tree, current.current, uci);
    // Moves come from `moves`, so this only fails if the two ever disagree.
    if (!result) return;
    setState({ tree: result.tree, current: result.id, selected: null, promotion: null });
  };

  /** Plays from→to if legal (asking for a piece first on a promotion); else drops it. */
  const tryMove = (current: ExplorerState, from: Square, to: Square) => {
    const target = findTarget(moves, from, to);
    if (!target) {
      setState({ ...current, selected: null });
    } else if (target.promotion) {
      setState({ ...current, selected: null, promotion: { from, to } });
    } else {
      play(current, toUci(from, to));
    }
  };

  // While a promotion waits for its piece, show the pawn already on its destination (and
  // any piece it takes gone). Only a preview: nothing is played until a piece is chosen.
  const pending = state?.promotion ?? null;
  const board: Board | null =
    position && pending
      ? movePiece(position.board, pending.from, pending.to)
      : (position?.board ?? null);

  const lastMove = node?.move
    ? { from: node.move.uci.slice(0, 2) as Square, to: node.move.uci.slice(2, 4) as Square }
    : null;

  return {
    /** The position on the board; null when not exploring. */
    position,
    /** The position before the move that led here; null at the start of the tree. */
    previous: state && node?.parent != null ? getNode(state.tree, node.parent).position : null,
    /** The move that led here; null at the start of the tree. */
    move: node?.move ?? null,
    /** What the board shows: the position, or a preview while a promotion is pending. */
    board,
    tree: state?.tree ?? null,
    current: state?.current ?? null,
    moves,
    selected: state?.selected ?? null,
    promotion: state?.promotion ?? null,
    lastMove,
    canGoBack: node?.parent != null,
    canGoForward: (node?.children.length ?? 0) > 0,

    /** Starts exploring a newly confirmed position. */
    start: (root: ConfirmedPosition) => {
      setState({ tree: createTree(root), current: 0, selected: null, promotion: null });
    },
    /** Stops exploring (back to setting up the position). */
    exit: () => {
      setState(null);
    },

    /** Whether a piece on `square` may be picked up (it's that side's turn and it can move). */
    canMove: (square: Square) => moves.has(square),

    /** A square was clicked: pick up, put down, or move the selected piece. */
    clickSquare: (square: Square) => {
      if (!state) return;
      if (state.promotion) {
        setState({ ...state, promotion: null });
      } else if (state.selected && state.selected !== square && !moves.has(square)) {
        tryMove(state, state.selected, square);
      } else if (moves.has(square) && state.selected !== square) {
        setState({ ...state, selected: square });
      } else {
        setState({ ...state, selected: null });
      }
    },

    /** A dragged piece was released over `target` (null: off the board). */
    drop: (from: Square, target: Square | null) => {
      if (!state) return;
      if (target === null) setState({ ...state, selected: null });
      else if (target === from) setState({ ...state, selected: from, promotion: null });
      else tryMove({ ...state, promotion: null }, from, target);
    },

    choosePromotion: (piece: PromotionPiece) => {
      if (!state?.promotion) return;
      play(state, toUci(state.promotion.from, state.promotion.to, piece));
    },
    cancelPromotion: () => {
      if (state) setState({ ...state, promotion: null });
    },

    back: () => {
      if (state) goTo(state, stepBack(state.tree, state.current));
    },
    forward: () => {
      if (state) goTo(state, stepForward(state.tree, state.current));
    },
  };
}
