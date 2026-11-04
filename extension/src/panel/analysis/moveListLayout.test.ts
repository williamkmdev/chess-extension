import { describe, expect, it } from 'vitest';
import { confirmed } from '../../engine/testing';
import { moveListTokens, type MoveListToken } from './moveListLayout';
import { createTree, playLine, type MoveTree, type NodeId } from './moveTree';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** The list as text, with side lines in parentheses. */
function text(tokens: readonly MoveListToken[]): string {
  return tokens
    .map((token) => (token.kind === 'move' ? token.label : token.kind === 'open' ? '(' : ')'))
    .join(' ')
    .replaceAll('( ', '(')
    .replaceAll(' )', ')');
}

/** Adds a line from `from`; returns the tree and the ids of its moves. */
function line(tree: MoveTree, from: NodeId, ...moves: string[]) {
  const result = playLine(tree, from, moves);
  expect(result.ids).toHaveLength(moves.length);
  return result;
}

describe('moveListTokens', () => {
  it('is empty before any move', () => {
    expect(moveListTokens(createTree(confirmed(START)))).toEqual([]);
  });

  it('numbers the main line', () => {
    const { tree } = line(createTree(confirmed(START)), 0, 'e2e4', 'e7e5', 'g1f3');
    expect(text(moveListTokens(tree))).toBe('1. e4 e5 2. Nf3');
  });

  it('numbers a first move by Black with an ellipsis', () => {
    const start = createTree(
      confirmed('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 12'),
    );
    const { tree } = line(start, 0, 'd8h4');
    expect(text(moveListTokens(tree))).toBe('12... Qh4#');
  });

  it('places side lines after the move they replace, renumbering after them', () => {
    // 1. e4 e5 2. Nf3 Nc6, with 1... c5 2. Nf3 and 2... d6 as side lines.
    const main = line(createTree(confirmed(START)), 0, 'e2e4', 'e7e5', 'g1f3', 'b8c6');
    const [e4 = -1, , nf3 = -1] = main.ids;
    const withC5 = line(main.tree, e4, 'c7c5', 'g1f3');
    const { tree } = line(withC5.tree, nf3, 'd7d6');
    expect(text(moveListTokens(tree))).toBe('1. e4 e5 (1... c5 2. Nf3) 2. Nf3 Nc6 (2... d6)');
  });

  it('renumbers the Black reply that follows a side line on a White move', () => {
    const main = line(createTree(confirmed(START)), 0, 'e2e4', 'e7e5');
    const { tree } = line(main.tree, 0, 'd2d4');
    expect(text(moveListTokens(tree))).toBe('1. e4 (1. d4) 1... e5');
  });

  it('nests side lines of side lines, with their depth', () => {
    const main = line(createTree(confirmed(START)), 0, 'e2e4', 'e7e5');
    const side = line(main.tree, main.ids[0] ?? -1, 'c7c5', 'g1f3');
    const { tree } = line(side.tree, side.ids[0] ?? -1, 'b1c3');
    const tokens = moveListTokens(tree);
    expect(text(tokens)).toBe('1. e4 e5 (1... c5 2. Nf3 (2. Nc3))');
    expect(
      tokens.flatMap((token) => (token.kind === 'move' ? [[token.label, token.depth]] : [])),
    ).toEqual([
      ['1. e4', 0],
      ['e5', 0],
      ['1... c5', 1],
      ['2. Nf3', 1],
      ['2. Nc3', 2],
    ]);
  });

  it('numbers a Black move that follows a side line', () => {
    const main = line(createTree(confirmed(START)), 0, 'e2e4', 'e7e5', 'g1f3', 'b8c6');
    const { tree } = line(main.tree, main.ids[1] ?? -1, 'f1c4');
    expect(text(moveListTokens(tree))).toBe('1. e4 e5 2. Nf3 (2. Bc4) 2... Nc6');
  });
});
