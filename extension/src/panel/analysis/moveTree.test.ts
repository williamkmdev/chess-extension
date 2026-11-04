import { describe, expect, it } from 'vitest';
import { confirmed } from '../../engine/testing';
import { confirmPosition } from '../../shared/confirm';
import { withAssumedCastling } from '../../shared/editing';
import { parseFen, toFen } from '../../shared/fen';
import type { ConfirmedPosition } from '../../shared/position';
import {
  createTree,
  getNode,
  mainLine,
  pathTo,
  playLine,
  playMove,
  stepBack,
  stepForward,
  type MoveTree,
  type NodeId,
} from './moveTree';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** Plays a sequence of moves along one line; fails the test if any is rejected. */
function play(tree: MoveTree, from: NodeId, ...moves: string[]): { tree: MoveTree; id: NodeId } {
  let current = { tree, id: from };
  for (const move of moves) {
    const result = playMove(current.tree, current.id, move);
    if (!result) throw new Error(`Move ${move} was rejected`);
    current = result;
  }
  return current;
}

const fenAt = (tree: MoveTree, id: NodeId) => toFen(getNode(tree, id).position);

describe('createTree', () => {
  it('starts with only the root, holding the confirmed position', () => {
    const position = confirmed(START);
    const tree = createTree(position);
    const root = getNode(tree, tree.root);
    expect(root).toEqual({ id: tree.root, parent: null, move: null, position, children: [] });
    expect(tree.nodes.size).toBe(1);
  });
});

describe('getNode', () => {
  it('throws for an unknown id', () => {
    expect(() => getNode(createTree(confirmed(START)), 42)).toThrow(RangeError);
  });
});

describe('playMove', () => {
  it('adds a legal move as a child with its notation and resulting position', () => {
    const tree = createTree(confirmed(START));
    const result = playMove(tree, tree.root, 'e2e4');
    expect(result).not.toBeNull();
    const { tree: next, id } = result ?? { tree, id: -1 };

    expect(getNode(next, id)).toMatchObject({
      parent: tree.root,
      move: { uci: 'e2e4', san: 'e4', color: 'w', moveNumber: 1 },
      children: [],
    });
    expect(getNode(next, next.root).children).toEqual([id]);
    expect(fenAt(next, id)).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
  });

  it('records move numbers and colors along a line, including Black to move first', () => {
    const tree = createTree(
      confirmed('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 12'),
    );
    const { tree: next, id } = play(tree, tree.root, 'd8h4');
    expect(getNode(next, id).move).toEqual({
      uci: 'd8h4',
      san: 'Qh4#',
      color: 'b',
      moveNumber: 12,
    });

    const line = play(createTree(confirmed(START)), 0, 'e2e4', 'e7e5', 'g1f3');
    const moves = pathTo(line.tree, line.id)
      .slice(1)
      .map((nodeId) => getNode(line.tree, nodeId).move);
    expect(moves.map((move) => [move?.san, move?.color, move?.moveNumber])).toEqual([
      ['e4', 'w', 1],
      ['e5', 'b', 1],
      ['Nf3', 'w', 2],
    ]);
  });

  it('leaves the original tree unchanged', () => {
    const tree = createTree(confirmed(START));
    const before = getNode(tree, tree.root);
    play(tree, tree.root, 'e2e4');
    expect(tree.nodes.size).toBe(1);
    expect(getNode(tree, tree.root)).toBe(before);
    expect(before.children).toEqual([]);
  });

  it.each([
    ['an illegal move', 'e2e5'],
    ['a move by the side not to move', 'e7e5'],
    ['a move from an empty square', 'e4e5'],
    ['malformed text', 'e2-e4'],
    ['uppercase text', 'E2E4'],
    ['a promotion letter on a non-promotion', 'e2e4q'],
  ])('rejects %s', (_label, move) => {
    const tree = createTree(confirmed(START));
    expect(playMove(tree, tree.root, move)).toBeNull();
  });

  it('throws for an unknown starting node', () => {
    expect(() => playMove(createTree(confirmed(START)), 7, 'e2e4')).toThrow(RangeError);
  });

  it('reuses the existing node when a move is played again', () => {
    const first = play(createTree(confirmed(START)), 0, 'e2e4');
    const again = playMove(first.tree, first.tree.root, 'e2e4');
    expect(again?.tree).toBe(first.tree);
    expect(again?.id).toBe(first.id);
  });

  it('keeps alternatives as separate children, the first played being the main one', () => {
    const a = play(createTree(confirmed(START)), 0, 'e2e4');
    const b = play(a.tree, a.tree.root, 'd2d4');
    const c = play(b.tree, b.tree.root, 'c2c4');
    expect(getNode(c.tree, c.tree.root).children).toEqual([a.id, b.id, c.id]);
    expect(new Set([a.id, b.id, c.id]).size).toBe(3);
  });

  it('branches from the middle of a line', () => {
    const line = play(createTree(confirmed(START)), 0, 'e2e4', 'e7e5', 'g1f3');
    const [, e4, e5] = pathTo(line.tree, line.id);
    const branch = play(line.tree, e4 ?? -1, 'c7c5');
    expect(getNode(branch.tree, e4 ?? -1).children).toEqual([e5, branch.id]);
    expect(getNode(branch.tree, branch.id).move?.san).toBe('c5');
  });

  it('handles castling, updating castling rights', () => {
    const tree = createTree(confirmed('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'));
    const { tree: next, id } = play(tree, tree.root, 'e1g1');
    expect(getNode(next, id).move?.san).toBe('O-O');
    expect(fenAt(next, id)).toBe('r3k2r/8/8/8/8/8/8/R4RK1 b kq - 1 1');
    // A long-castle king move written as king-takes-rook isn't the engine's notation.
    expect(playMove(tree, tree.root, 'e1a1')).toBeNull();
  });

  it('requires a promotion piece and records the chosen one', () => {
    const tree = createTree(confirmed('4k3/P7/8/8/8/8/8/4K3 w - - 0 1'));
    expect(playMove(tree, tree.root, 'a7a8')).toBeNull();

    const queen = play(tree, tree.root, 'a7a8q');
    const knight = play(queen.tree, queen.tree.root, 'a7a8n');
    expect(getNode(knight.tree, queen.id).move?.san).toBe('a8=Q+');
    expect(getNode(knight.tree, knight.id).move?.san).toBe('a8=N');
    expect(fenAt(knight.tree, knight.id)).toBe('N3k3/8/8/8/8/8/8/4K3 b - - 0 1');
  });

  it('handles en passant, including the target square after a double push', () => {
    const tree = createTree(confirmed('4k3/8/8/8/1p6/8/P7/4K3 w - - 0 1'));
    const push = play(tree, tree.root, 'a2a4');
    expect(fenAt(push.tree, push.id)).toBe('4k3/8/8/8/Pp6/8/8/4K3 b - a3 0 1');

    const capture = play(push.tree, push.id, 'b4a3');
    expect(getNode(capture.tree, capture.id).move?.san).toBe('bxa3');
    expect(fenAt(capture.tree, capture.id)).toBe('4k3/8/8/8/8/p7/8/4K3 w - - 0 2');
  });

  it('tracks the halfmove clock and full-move number', () => {
    const line = play(createTree(confirmed(START)), 0, 'g1f3', 'g8f6', 'f3g1');
    expect(fenAt(line.tree, line.id)).toBe(
      'rnbqkb1r/pppppppp/5n2/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 3 2',
    );
  });

  it('allows no moves after checkmate', () => {
    const tree = createTree(confirmed('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1'));
    expect(playMove(tree, tree.root, 'h8g7')).toBeNull();
    expect(playMove(tree, tree.root, 'h8h7')).toBeNull();
  });
});

describe('metadata labels after a move', () => {
  /** A position with only placement and side to move stated; the rest are defaults. */
  function assumed(fen: string): ConfirmedPosition {
    const parsed = parseFen(fen);
    if (!parsed.ok) throw new Error('bad FEN');
    const result = confirmPosition(withAssumedCastling(parsed.position));
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    return result.position;
  }
  const sources = (position: ConfirmedPosition) => ({
    castling: [
      position.castling.whiteKingside.source,
      position.castling.whiteQueenside.source,
      position.castling.blackKingside.source,
      position.castling.blackQueenside.source,
    ],
    enPassant: position.enPassant.source,
    halfmoveClock: position.halfmoveClock.source,
    fullmoveNumber: position.fullmoveNumber.source,
  });

  it('keeps assumptions the move does not settle', () => {
    const tree = createTree(assumed('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w'));
    const { tree: next, id } = play(tree, tree.root, 'g1f3');
    expect(sources(getNode(next, id).position)).toEqual({
      castling: ['default', 'default', 'default', 'default'],
      enPassant: 'provided',
      halfmoveClock: 'default',
      fullmoveNumber: 'default',
    });
  });

  it('marks what the move establishes as provided', () => {
    const tree = createTree(assumed('r3k2r/p7/8/8/8/8/8/R3K2R w'));
    // The king move removes both White rights; a pawn move resets the halfmove clock.
    const kingMove = play(tree, tree.root, 'e1f1');
    const king = getNode(kingMove.tree, kingMove.id).position;
    expect(sources(king).castling).toEqual(['provided', 'provided', 'default', 'default']);
    expect(king.castling.whiteKingside.value).toBe(false);
    expect(king.halfmoveClock).toEqual({ value: 1, source: 'default' });

    const pawnMove = play(kingMove.tree, kingMove.id, 'a7a5');
    const pawn = getNode(pawnMove.tree, pawnMove.id).position;
    expect(pawn.halfmoveClock).toEqual({ value: 0, source: 'provided' });
    expect(pawn.fullmoveNumber).toEqual({ value: 2, source: 'default' });
  });

  it('keeps stated values stated', () => {
    const tree = createTree(confirmed(START));
    const { tree: next, id } = play(tree, tree.root, 'g1f3');
    expect(sources(getNode(next, id).position)).toEqual({
      castling: ['provided', 'provided', 'provided', 'provided'],
      enPassant: 'provided',
      halfmoveClock: 'provided',
      fullmoveNumber: 'provided',
    });
  });
});

describe('playLine', () => {
  it('adds a line of moves and returns the node of each', () => {
    const tree = createTree(confirmed(START));
    const { tree: next, ids } = playLine(tree, tree.root, ['e2e4', 'e7e5', 'g1f3']);
    expect(ids).toHaveLength(3);
    expect(pathTo(next, ids[2] ?? -1)).toEqual([next.root, ...ids]);
    expect(getNode(next, ids[2] ?? -1).move?.san).toBe('Nf3');
  });

  it('reuses explored moves, and is the main line only where there was none', () => {
    // 1. e4 c5 explored first; then the line 1. e4 e5 2. Nf3.
    const explored = play(createTree(confirmed(START)), 0, 'e2e4', 'c7c5');
    const [, e4 = -1, c5 = -1] = pathTo(explored.tree, explored.id);
    const { tree, ids } = playLine(explored.tree, explored.tree.root, ['e2e4', 'e7e5', 'g1f3']);
    expect(ids[0]).toBe(e4);
    expect(getNode(tree, e4).children).toEqual([c5, ids[1]]);
    expect(mainLine(tree, tree.root)).toEqual([e4, c5]);
    // After 1... e5 there was no continuation, so the line's 2. Nf3 is the main one.
    expect(stepForward(tree, ids[1] ?? -1)).toBe(ids[2]);
  });

  it('stops at the first illegal move', () => {
    const tree = createTree(confirmed(START));
    const { tree: next, ids } = playLine(tree, tree.root, ['e2e4', 'e2e4', 'g1f3']);
    expect(ids).toHaveLength(1);
    expect(next.nodes.size).toBe(2);
    expect(playLine(tree, tree.root, ['e7e5'])).toEqual({ tree, ids: [] });
  });
});

describe('navigation', () => {
  // 1. e4 e5 2. Nf3, with 1... c5 as an alternative to 1... e5.
  const line = play(createTree(confirmed(START)), 0, 'e2e4', 'e7e5', 'g1f3');
  const [root = -1, e4 = -1, e5 = -1, nf3 = -1] = pathTo(line.tree, line.id);
  const { tree, id: c5 } = play(line.tree, e4, 'c7c5');

  it('pathTo lists the nodes from the root, both ends included', () => {
    expect(pathTo(tree, nf3)).toEqual([root, e4, e5, nf3]);
    expect(pathTo(tree, c5)).toEqual([root, e4, c5]);
    expect(pathTo(tree, root)).toEqual([root]);
  });

  it('stepBack goes to the parent, and stops at the root', () => {
    expect(stepBack(tree, nf3)).toBe(e5);
    expect(stepBack(tree, c5)).toBe(e4);
    expect(stepBack(tree, root)).toBeNull();
  });

  it('stepForward follows the main continuation, and stops at the end of a line', () => {
    expect(stepForward(tree, root)).toBe(e4);
    expect(stepForward(tree, e4)).toBe(e5);
    expect(stepForward(tree, nf3)).toBeNull();
    expect(stepForward(tree, c5)).toBeNull();
  });

  it('mainLine lists the main continuation to the end of the line', () => {
    expect(mainLine(tree, root)).toEqual([e4, e5, nf3]);
    expect(mainLine(tree, e5)).toEqual([nf3]);
    expect(mainLine(tree, nf3)).toEqual([]);
  });
});
