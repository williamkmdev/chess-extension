// Lays out the whole move tree as a PGN-style list, e.g.
//   1. e4 e5 (1... c5 2. Nf3) 2. Nf3 Nc6 (2... d6) 3. Bb5
// Side lines follow the move they're an alternative to, in parentheses, nested as deep
// as the tree goes. White moves are always numbered; a Black move is numbered ("1...")
// when it starts a line or follows a side line, as in PGN.

import { getNode, type MoveNode, type MoveTree, type NodeId } from './moveTree';

export type MoveListToken =
  | {
      readonly kind: 'move';
      readonly id: NodeId;
      readonly label: string;
      /** 0 for the main line, 1 for its side lines, and so on. */
      readonly depth: number;
    }
  | { readonly kind: 'open'; readonly depth: number }
  | { readonly kind: 'close'; readonly depth: number };

function label(node: MoveNode, numbered: boolean): string {
  const move = node.move;
  if (!move) return '';
  if (move.color === 'w') return `${String(move.moveNumber)}. ${move.san}`;
  return numbered ? `${String(move.moveNumber)}... ${move.san}` : move.san;
}

/** The tokens of the line starting with move `first`, including its side lines. */
function layLine(tree: MoveTree, first: NodeId, depth: number, tokens: MoveListToken[]): void {
  let numbered = true;
  for (let id: NodeId | undefined = first; id !== undefined;) {
    const node = getNode(tree, id);
    tokens.push({ kind: 'move', id, label: label(node, numbered), depth });
    numbered = false;

    // The alternatives to this move, if it's the main continuation where it branches.
    const parent = node.parent === null ? null : getNode(tree, node.parent);
    if (parent?.children[0] === id) {
      for (const alternative of parent.children.slice(1)) {
        tokens.push({ kind: 'open', depth: depth + 1 });
        layLine(tree, alternative, depth + 1, tokens);
        tokens.push({ kind: 'close', depth: depth + 1 });
        numbered = true;
      }
    }
    id = node.children[0];
  }
}

export function moveListTokens(tree: MoveTree): MoveListToken[] {
  const tokens: MoveListToken[] = [];
  const first = getNode(tree, tree.root).children[0];
  if (first !== undefined) layLine(tree, first, 0, tokens);
  return tokens;
}
