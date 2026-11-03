import {
  isDarkSquare,
  type Board as BoardState,
  type Color,
  type Square,
} from '../../shared/position';
import { displayRows } from './layout';
import { pieceImage, pieceName } from './pieceImages';
import './board.css';

export interface BoardProps {
  readonly board: BoardState;
  /** Which side is shown at the bottom. UI state only; not part of the position. */
  readonly orientation: Color;
  /** Pointer pressed on a square; editing (click, drag) is handled by the caller. */
  readonly onSquarePointerDown?: (square: Square, event: PointerEvent) => void;
  /** Square whose piece is currently being dragged; shown dimmed. */
  readonly dragFrom?: Square | null;
}

export function Board({ board, orientation, onSquarePointerDown, dragFrom }: BoardProps) {
  const rows = displayRows(orientation);
  return (
    <div class="board" role="grid" aria-label="Chess board">
      {rows.map((row, rowIndex) => (
        <div class="board-row" role="row" key={rowIndex}>
          {row.map((square, columnIndex) => {
            const piece = board[square];
            return (
              <div
                key={square}
                role="gridcell"
                class={`square ${isDarkSquare(square) ? 'dark' : 'light'}`}
                data-square={square}
                aria-label={piece ? `${square}, ${pieceName(piece)}` : `${square}, empty`}
                onPointerDown={(event) => {
                  onSquarePointerDown?.(square, event);
                }}
              >
                {columnIndex === 0 && <span class="coord rank">{square[1]}</span>}
                {rowIndex === rows.length - 1 && <span class="coord file">{square[0]}</span>}
                {piece && (
                  <img
                    class={`piece${square === dragFrom ? ' dragging' : ''}`}
                    src={pieceImage(piece)}
                    alt=""
                    draggable={false}
                  />
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
