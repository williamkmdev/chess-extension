// Exploring a confirmed position: which move of the tree is on the board, which piece
// is picked up, and a promotion waiting for its piece. Only legal moves are played.

import { useMemo, useRef, useState } from 'preact/hooks';
import { movePiece } from '../../shared/editing';
import type { Board, Color, ConfirmedPosition, Square } from '../../shared/position';
import { findTarget, legalMoves, toUci, type LegalMoves, type PromotionPiece } from './legalMoves';
import {
  createTree,
  deleteSubtree,
  getNode,
  isInMainLine,
  mainLine,
  playLine,
  playMove,
  promoteToMainLine,
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
  /** While playing against Stockfish: the side you play. */
  const [playing, setPlayingState] = useState<Color | null>(null);
  // The same, readable at once by a queued engine reply (state only updates on render).
  const livePlaying = useRef<Color | null>(null);
  const setPlaying = (color: Color | null) => {
    livePlaying.current = color;
    setPlayingState(color);
  };
  const node: MoveNode | null = state ? getNode(state.tree, state.current) : null;
  const position = node?.position ?? null;
  const legal = useMemo(() => (position ? legalMoves(position) : NO_MOVES), [position]);
  // The moves you may make: while playing, none on Stockfish's turn.
  const moves = playing !== null && position?.sideToMove !== playing ? NO_MOVES : legal;

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
    /** The current move has no continuation yet. */
    atLineEnd: node !== null && node.children.length === 0,
    /** The side to move has no legal move (checkmate or stalemate). */
    gameOver: position !== null && legal.size === 0,
    /** While playing against Stockfish: the side you play; otherwise null. */
    playing,
    /** The current move is on the main line (always true at the start). */
    inMainLine: state ? isInMainLine(state.tree, state.current) : true,

    /** Starts exploring a newly confirmed position. */
    start: (root: ConfirmedPosition) => {
      setState({ tree: createTree(root), current: 0, selected: null, promotion: null });
    },
    /** Stops exploring (back to setting up the position). */
    exit: () => {
      setState(null);
      setPlaying(null);
    },

    /**
     * Starts playing against Stockfish. You play the side to move now, unless
     * `stockfishFirst`: then Stockfish plays it and you play the other side.
     */
    startPlaying: (stockfishFirst = false) => {
      if (!position) return;
      const toMove = position.sideToMove;
      setPlaying(stockfishFirst ? (toMove === 'w' ? 'b' : 'w') : toMove);
      if (state) setState({ ...state, selected: null, promotion: null });
    },
    stopPlaying: () => {
      setPlaying(null);
    },
    /**
     * Plays Stockfish's move found for move `at`. Checked against the live state, not
     * this render's: a click that happened since (Back, Stop playing, Edit position)
     * wins, and nothing is played unless it's still Stockfish's turn at the end of that
     * line in a game that's still on.
     */
    playEngineMove: (at: NodeId, uci: string) => {
      setState((live) => {
        const you = livePlaying.current;
        if (!live || you === null || live.current !== at) return live;
        const node = getNode(live.tree, at);
        if (node.children.length > 0 || node.position.sideToMove === you) return live;
        const result = playMove(live.tree, at, uci);
        if (!result) return live;
        return { tree: result.tree, current: result.id, selected: null, promotion: null };
      });
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

    /**
     * Adds a line of moves (e.g. the engine's) from the current position and goes to its
     * move at `index` (or the last one that was legal).
     */
    /** Jumps to any move of the tree (e.g. clicked in the move list). */
    goToNode: (id: NodeId) => {
      if (state?.tree.nodes.has(id)) goTo(state, id);
    },
    goToStart: () => {
      if (state) goTo(state, state.tree.root);
    },
    /** To the end of the main continuation from the current move. */
    goToEnd: () => {
      if (state) goTo(state, mainLine(state.tree, state.current).at(-1) ?? null);
    },
    /** Makes the line through the current move the main line. */
    makeMainLine: () => {
      if (!state) return;
      const tree = promoteToMainLine(state.tree, state.current);
      if (tree !== state.tree) setState({ ...state, tree });
    },
    /** Removes the current move and everything after it; goes to the move before. */
    deleteFromHere: () => {
      if (!state || state.current === state.tree.root) return;
      const { tree, parent } = deleteSubtree(state.tree, state.current);
      setState({ tree, current: parent, selected: null, promotion: null });
    },

    playLine: (moves: readonly string[], index: number) => {
      if (!state) return;
      const { tree, ids } = playLine(state.tree, state.current, moves);
      const target = ids[Math.min(index, ids.length - 1)];
      if (target === undefined) return;
      setState({ tree, current: target, selected: null, promotion: null });
    },
  };
}
