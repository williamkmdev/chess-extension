import { useState } from 'preact/hooks';
import { confirmPosition, type ConfirmResult } from '../shared/confirm';
import { isSamePiece, movePiece, placePiece, withAssumedCastling } from '../shared/editing';
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
import { ConfirmPanel } from './editor/ConfirmPanel';
import { FenImport } from './editor/FenImport';
import { Palette, type Tool } from './editor/Palette';
import { PositionDetails } from './editor/PositionDetails';
import { useDragPiece } from './editor/useDragPiece';

interface Confirmation {
  /** The exact draft this result was computed for. */
  readonly draft: DraftPosition;
  readonly result: ConfirmResult;
}

export function App() {
  const [position, setPosition] = useState<DraftPosition>(startingPosition);
  const [orientation, setOrientation] = useState<Color>('w');
  const [tool, setTool] = useState<Tool | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  // Every edit produces a new draft object, so a confirmation only stays visible
  // while nothing has changed since it was computed.
  const result = confirmation?.draft === position ? confirmation.result : null;
  const highlightedSquares =
    result && !result.ok
      ? result.errors.flatMap((error) => ('squares' in error ? (error.squares ?? []) : []))
      : [];

  // Unstated castling rights follow the pieces (see withAssumedCastling).
  const replacePosition = (next: DraftPosition) => {
    setPosition(withAssumedCastling(next));
  };
  const updateBoard = (edit: (board: BoardState) => BoardState) => {
    setPosition((current) => withAssumedCastling({ ...current, board: edit(current.board) }));
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
        highlightedSquares={highlightedSquares}
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
            replacePosition(emptyDraft());
          }}
        >
          Clear board
        </button>
        <button
          type="button"
          onClick={() => {
            replacePosition(startingPosition());
          }}
        >
          Starting position
        </button>
      </div>
      <PositionDetails position={position} onChange={replacePosition} />
      <ConfirmPanel
        result={result}
        onConfirm={() => {
          setConfirmation({ draft: position, result: confirmPosition(position) });
        }}
      />
      <FenImport onLoad={replacePosition} />
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
