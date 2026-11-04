import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { moveListTokens } from './moveListLayout';
import type { MoveTree, NodeId } from './moveTree';

export interface MoveListProps {
  readonly tree: MoveTree;
  /** The move on the board. */
  readonly current: NodeId;
  readonly onSelect: (id: NodeId) => void;
  /** Actions shown under the list (e.g. Make main line). */
  readonly children?: ComponentChildren;
}

interface Scrollable {
  scrollTop: number;
  getBoundingClientRect(): { top: number; bottom: number };
}

/**
 * Scrolls `box` just enough to show `item`. Only the box itself scrolls: unlike
 * scrollIntoView, the panel (and so the board) never moves.
 */
export function keepInView(
  box: Scrollable,
  item: { getBoundingClientRect(): { top: number; bottom: number } },
): void {
  const outer = box.getBoundingClientRect();
  const inner = item.getBoundingClientRect();
  if (inner.top < outer.top) box.scrollTop -= outer.top - inner.top;
  else if (inner.bottom > outer.bottom) box.scrollTop += inner.bottom - outer.bottom;
}

/** The whole tree as a PGN-style list; click any move to put the board there. */
export function MoveList({ tree, current, onSelect, children }: MoveListProps) {
  const tokens = useMemo(() => moveListTokens(tree), [tree]);
  const list = useRef<HTMLParagraphElement>(null);

  // Keep the current move visible when the list is longer than its box.
  useEffect(() => {
    const box = list.current;
    const item = box?.querySelector('[aria-current="true"]');
    if (box && item) keepInView(box, item);
  }, [current, tree]);

  if (tokens.length === 0) return null;

  return (
    <section class="moves" aria-label="Moves">
      <h2>Moves</h2>
      <p class="move-list" ref={list}>
        {tokens.map((token, index) => {
          const previous = tokens[index - 1];
          // No space after "(" or before ")".
          const space = index > 0 && previous?.kind !== 'open' && token.kind !== 'close';
          if (token.kind !== 'move') {
            return (
              <span key={`${token.kind}-${String(index)}`} class="move-list-paren">
                {space && ' '}
                {token.kind === 'open' ? '(' : ')'}
              </span>
            );
          }
          return (
            <span key={token.id}>
              {space && ' '}
              <button
                type="button"
                class={`move-list-move${token.depth > 0 ? ' side-line' : ''}`}
                aria-current={token.id === current ? 'true' : 'false'}
                onClick={() => {
                  onSelect(token.id);
                }}
              >
                {token.label}
              </button>
            </span>
          );
        })}
      </p>
      {children}
    </section>
  );
}
