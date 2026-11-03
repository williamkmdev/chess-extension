import { useState } from 'preact/hooks';
import { isSamePiece, movePiece, placePiece } from '../shared/editing';
import {
  emptyDraft,
  startingPosition,
  type Board as BoardState,
  type Color,
  type DraftPosition,
  type Square,
} from '../shared/position';
import { Board } from './board/Board';
import { pieceImage } from './board/pieceImages';
import { Palette, type Tool } from './editor/Palette';
import { useDragPiece } from './editor/useDragPiece';

export function App() {
  const [position, setPosition] = useState<DraftPosition>(startingPosition);
  const [orientation, setOrientation] = useState<Color>('w');
  const [tool, setTool] = useState<Tool | null>(null);

  // Piece edits change only the board; metadata stays as the user left it.
  const updateBoard = (edit: (board: BoardState) => BoardState) => {
    setPosition((current) => ({ ...current, board: edit(current.board) }));
  };

  const applyTool = (square: Square) => {
    if (!tool) return;
    updateBoard((board) => {
      if (tool.kind === 'eraser' || isSamePiece(board[square], tool.piece)) {
        return placePiece(board, square, null);
      }
      return placePiece(board, square, tool.piece);
    });
  };

  const { drag, beginPress, consumePaletteDragClick } = useDragPiece({
    onSquareClick: applyTool,
    onDrop: ({ piece, from }, target) => {
      updateBoard((board) => {
        if (from) return target ? movePiece(board, from, target) : placePiece(board, from, null);
        return target ? placePiece(board, target, piece) : board;
      });
    },
  });

  return (
    <>
      <h1>Chess Position Explorer</h1>
      <Board
        board={position.board}
        orientation={orientation}
        dragFrom={drag?.from ?? null}
        onSquarePointerDown={(square, event) => {
          beginPress(event, { piece: position.board[square], square });
        }}
      />
      <Palette
        selected={tool}
        onSelect={(next) => {
          if (!consumePaletteDragClick()) setTool(next);
        }}
        onPiecePointerDown={(piece, event) => {
          beginPress(event, { piece, square: null });
        }}
      />
      <div class="toolbar">
        <button
          type="button"
          onClick={() => {
            setOrientation((current) => (current === 'w' ? 'b' : 'w'));
          }}
        >
          Flip board
        </button>
        <button
          type="button"
          onClick={() => {
            // A fresh setup: nothing about the old position's metadata carries over.
            setPosition(emptyDraft());
          }}
        >
          Clear board
        </button>
        <button
          type="button"
          onClick={() => {
            setPosition(startingPosition());
          }}
        >
          Starting position
        </button>
      </div>
      {drag && (
        <img
          class="drag-ghost"
          src={pieceImage(drag.piece)}
          alt=""
          style={{ left: `${String(drag.x)}px`, top: `${String(drag.y)}px` }}
        />
      )}
    </>
  );
}
