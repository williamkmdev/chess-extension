import { useEffect, useRef, useState } from 'preact/hooks';
import type { EngineTransport } from '../engine/engine';
import { confirmPosition, type ConfirmationError } from '../shared/confirm';
import { isSamePiece, movePiece, placePiece, withAssumedCastling } from '../shared/editing';
import { toFen } from '../shared/fen';
import {
  emptyDraft,
  startingPosition,
  type Board as BoardState,
  type Color,
  type DraftPosition,
  type Square,
} from '../shared/position';
import { AnalysisPanel } from './analysis/AnalysisPanel';
import { MoveComparison } from './analysis/MoveComparison';
import { PromotionPicker } from './analysis/PromotionPicker';
import { ANALYSIS_DEPTH, useAnalysis } from './analysis/useAnalysis';
import { useExplorer } from './analysis/useExplorer';
import { Board } from './board/Board';
import { pieceImage } from './board/pieceImages';
import { useDragPiece } from './board/useDragPiece';
import { ConfirmedFen, ConfirmPanel } from './editor/ConfirmPanel';
import { FenImport } from './editor/FenImport';
import { Palette, type Tool } from './editor/Palette';
import { PositionDetails } from './editor/PositionDetails';

interface FailedConfirmation {
  /** The exact draft these errors were computed for. */
  readonly draft: DraftPosition;
  readonly errors: readonly ConfirmationError[];
}

export interface AppProps {
  /** Engine factory; tests pass a fake. Defaults to the bundled Stockfish worker. */
  readonly createTransport?: () => EngineTransport;
}

const COLOR_NAMES: Readonly<Record<Color, string>> = { w: 'White', b: 'Black' };

/**
 * Two modes. Set up: edit the draft and confirm it. Explore: a confirmed position on the
 * board, where only legal moves can be played and the engine analyzes the position shown.
 */
export function App({ createTransport }: AppProps = {}) {
  const [position, setPosition] = useState<DraftPosition>(startingPosition);
  const [orientation, setOrientation] = useState<Color>('w');
  const [tool, setTool] = useState<Tool | null>(null);
  const [failure, setFailure] = useState<FailedConfirmation | null>(null);
  const explorer = useExplorer();
  /** The position being explored; null while setting up. */
  const exploring = explorer.position;

  // Every edit produces a new draft object, so errors only stay visible while nothing
  // has changed since they were computed.
  const errors = failure?.draft === position ? failure.errors : null;
  // The engine follows the position on the board while exploring; leaving stops it.
  // The position before the last move is searched too, to compare that move with the
  // engine's choice there.
  const analysis = useAnalysis(
    exploring,
    explorer.previous,
    createTransport ? { createTransport } : undefined,
  );
  const highlightedSquares =
    errors?.flatMap((error) => ('squares' in error ? (error.squares ?? []) : [])) ?? [];

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
    onSquareClick: (square) => {
      if (exploring) explorer.clickSquare(square);
      else applyTool(square);
    },
    onDrop: ({ piece, from }, target) => {
      if (exploring) {
        if (from) explorer.drop(from, target);
        return;
      }
      updateBoard((board) => {
        if (from) return target ? movePiece(board, from, target) : placePiece(board, from, null);
        return target ? placePiece(board, target, piece) : board;
      });
    },
  });

  // Arrow keys step through the moves while exploring.
  const keys = useRef({ exploring: false, explorer });
  keys.current = { exploring: exploring !== null, explorer };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const { exploring: active, explorer: current } = keys.current;
      if (!active || current.promotion) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      // Arrow keys move the caret while typing in a field.
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      ) {
        return;
      }
      if (event.key === 'ArrowLeft') current.back();
      else if (event.key === 'ArrowRight') current.forward();
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const targetsFrom = (from: Square | null) =>
    from ? (explorer.moves.get(from) ?? []).map((target) => target.to) : [];

  const flipButton = (
    <button
      type="button"
      onClick={() => {
        setOrientation((current) => (current === 'w' ? 'b' : 'w'));
      }}
    >
      Flip board
    </button>
  );

  return (
    <>
      <h1>Chess Position Explorer</h1>
      {exploring ? (
        <>
          <Board
            board={explorer.board ?? exploring.board}
            orientation={orientation}
            dragFrom={drag?.from ?? null}
            selectedSquare={explorer.selected}
            targetSquares={targetsFrom(drag?.from ?? explorer.selected)}
            lastMove={explorer.lastMove}
            onSquarePointerDown={(square, event) => {
              // Only the side to move's pieces can be picked up; other presses are clicks.
              const piece = explorer.canMove(square) ? exploring.board[square] : undefined;
              beginPress(event, { piece, square });
            }}
          />
          {explorer.promotion && (
            <PromotionPicker
              color={exploring.sideToMove}
              onChoose={explorer.choosePromotion}
              onCancel={explorer.cancelPromotion}
            />
          )}
          <p class="turn">{COLOR_NAMES[exploring.sideToMove]} to move</p>
          <div class="toolbar">
            <button type="button" disabled={!explorer.canGoBack} onClick={explorer.back}>
              Back
            </button>
            <button type="button" disabled={!explorer.canGoForward} onClick={explorer.forward}>
              Forward
            </button>
            {flipButton}
            <button type="button" onClick={explorer.exit}>
              Edit position
            </button>
          </div>
          <section class="confirm" aria-label="Current position">
            <ConfirmedFen key={toFen(exploring)} position={exploring} />
          </section>
          {explorer.move && explorer.previous && (
            <MoveComparison
              move={explorer.move}
              before={explorer.previous}
              after={exploring}
              beforeResult={analysis.completed(explorer.previous)}
              afterResult={analysis.completed(exploring)}
            />
          )}
          <AnalysisPanel
            position={exploring}
            analysis={analysis}
            targetDepth={ANALYSIS_DEPTH}
            onRetry={analysis.retry}
            onPlayLine={explorer.playLine}
          />
        </>
      ) : (
        <>
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
            {flipButton}
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
            errors={errors}
            onConfirm={() => {
              const result = confirmPosition(position);
              if (result.ok) {
                setFailure(null);
                explorer.start(result.position);
              } else {
                setFailure({ draft: position, errors: result.errors });
              }
            }}
          />
          <FenImport onLoad={replacePosition} />
        </>
      )}

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
