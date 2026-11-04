// The lines explored from a confirmed position, as a tree of moves.
//
// Pure and immutable: every change returns a new tree and leaves the old one intact, so
// it can live directly in UI state. chess.js decides which moves are legal and what
// position each one leads to.

import { Chess } from 'chess.js';
import { isUciMove, type UciMove } from '../../engine/uci';
import { confirmPosition } from '../../shared/confirm';
import { parseFen, toFen } from '../../shared/fen';
import {
  CASTLING_RIGHTS,
  type CastlingRight,
  type Color,
  type ConfirmedPosition,
  type DraftPosition,
  type MetadataField,
} from '../../shared/position';

export type NodeId = number;

export interface PlayedMove {
  /** Long algebraic notation, as the engine uses it: "e2e4", "e7e8q", "e1g1". */
  readonly uci: UciMove;
  /** Standard notation, e.g. "Nf3", "exd5", "O-O", "e8=Q+". */
  readonly san: string;
  readonly color: Color;
  /** The full-move number this move belongs to ("12" in "12... Qh4#"). */
  readonly moveNumber: number;
}

export interface MoveNode {
  readonly id: NodeId;
  /** null only for the root. */
  readonly parent: NodeId | null;
  /** The move that led here; null only for the root. */
  readonly move: PlayedMove | null;
  /** The position after `move` (for the root: the confirmed starting position). */
  readonly position: ConfirmedPosition;
  /** Continuations in the order they were first played; the first is the main one. */
  readonly children: readonly NodeId[];
}

export interface MoveTree {
  readonly root: NodeId;
  readonly nodes: ReadonlyMap<NodeId, MoveNode>;
  readonly nextId: NodeId;
}

export function createTree(position: ConfirmedPosition): MoveTree {
  const root: MoveNode = { id: 0, parent: null, move: null, position, children: [] };
  return { root: root.id, nodes: new Map([[root.id, root]]), nextId: 1 };
}

export function getNode(tree: MoveTree, id: NodeId): MoveNode {
  const node = tree.nodes.get(id);
  if (!node) throw new RangeError(`No move-tree node with id ${String(id)}`);
  return node;
}

export interface PlayResult {
  readonly tree: MoveTree;
  /** The node reached by the move (an existing one if it had been played before). */
  readonly id: NodeId;
}

/**
 * Plays `uci` from node `from`. Returns null if the move isn't legal there (including a
 * promotion without a chosen piece). Playing a move that was already explored from that
 * node returns the existing node and the unchanged tree, so lines are never duplicated.
 */
export function playMove(tree: MoveTree, from: NodeId, uci: string): PlayResult | null {
  const parent = getNode(tree, from);
  if (!isUciMove(uci)) return null;

  // The position was confirmed (validated) before it entered the tree.
  const chess = new Chess(toFen(parent.position), { skipValidation: true });
  let played;
  try {
    const promotion = uci.length === 5 ? uci[4] : undefined;
    played = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ...(promotion !== undefined && { promotion }),
    });
  } catch {
    return null;
  }
  // chess.js ignores a promotion letter on a move that isn't a promotion.
  if (played.lan !== uci) return null;

  const existing = parent.children.find((id) => getNode(tree, id).move?.uci === played.lan);
  if (existing !== undefined) return { tree, id: existing };

  const node: MoveNode = {
    id: tree.nextId,
    parent: parent.id,
    move: {
      uci: played.lan,
      san: played.san,
      color: parent.position.sideToMove,
      moveNumber: parent.position.fullmoveNumber.value,
    },
    position: positionAfterMove(parent.position, played.after),
    children: [],
  };
  const nodes = new Map(tree.nodes);
  nodes.set(parent.id, { ...parent, children: [...parent.children, node.id] });
  nodes.set(node.id, node);
  return { tree: { ...tree, nodes, nextId: node.id + 1 }, id: node.id };
}

/**
 * The position after a legal move, keeping the parent's labels: a value the move doesn't
 * settle stays a default if it was one (e.g. an assumed castling right that survives,
 * or a move counter that was never stated). Only what the move itself establishes is
 * marked as provided: a castling right it removes, the en-passant square, and a
 * halfmove clock it resets.
 */
function positionAfterMove(before: ConfirmedPosition, fen: string): ConfirmedPosition {
  const parsed = parseFen(fen);
  if (!parsed.ok) throw new Error(`chess.js produced an unreadable FEN: ${fen}`);
  const after = parsed.position;

  const castling = Object.fromEntries(
    CASTLING_RIGHTS.map((right) => {
      const previous = before.castling[right];
      const value = after.castling[right].value;
      const source = previous.value && !value ? 'provided' : previous.source;
      return [right, { value, source }];
    }),
  ) as Record<CastlingRight, MetadataField<boolean>>;

  const halfmove = after.halfmoveClock.value;
  const draft: DraftPosition = {
    ...after,
    castling,
    enPassant: { value: after.enPassant.value, source: 'provided' },
    halfmoveClock: {
      value: halfmove,
      source: halfmove === 0 ? 'provided' : before.halfmoveClock.source,
    },
    fullmoveNumber: { value: after.fullmoveNumber.value, source: before.fullmoveNumber.source },
  };

  // A legal move from a valid position always leads to a valid position.
  const confirmed = confirmPosition(draft);
  if (!confirmed.ok) throw new Error(`Position after a legal move failed validation: ${fen}`);
  return confirmed.position;
}

/** Node ids from the root down to `id`, both included. */
export function pathTo(tree: MoveTree, id: NodeId): NodeId[] {
  const path: NodeId[] = [];
  for (let node: MoveNode | null = getNode(tree, id); node;) {
    path.push(node.id);
    node = node.parent === null ? null : getNode(tree, node.parent);
  }
  return path.reverse();
}

/** One move back, or null at the root. */
export function stepBack(tree: MoveTree, id: NodeId): NodeId | null {
  return getNode(tree, id).parent;
}

/** One move forward along the main continuation, or null at the end of a line. */
export function stepForward(tree: MoveTree, id: NodeId): NodeId | null {
  return getNode(tree, id).children[0] ?? null;
}

/** The main continuation from `id` to the end of its line (excluding `id`). */
export function mainLine(tree: MoveTree, id: NodeId): NodeId[] {
  const line: NodeId[] = [];
  for (let next = stepForward(tree, id); next !== null; next = stepForward(tree, next)) {
    line.push(next);
  }
  return line;
}
