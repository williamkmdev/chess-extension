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
import { MoveList } from './analysis/MoveList';
import { PromotionPicker } from './analysis/PromotionPicker';
import { ANALYSIS_DEPTH, useAnalysis } from './analysis/useAnalysis';
import { useExplorer } from './analysis/useExplorer';
import { usePlayVsEngine, type PlayStatus } from './analysis/usePlayVsEngine';
import { Board } from './board/Board';
import { CapturePanel } from './capture/CapturePanel';
import { captureWithChrome, type CaptureVisibleTab, type Screenshot } from './capture/captureTab';
import { cropWithCanvas, type CropImage } from './capture/cropImage';
import { findBoardWithCanvas, type FindBoard } from './capture/findBoard';
import { recognizeWithOnnx, type Recognize } from './capture/recognize';
import { pieceImage } from './board/pieceImages';
import { useDragPiece } from './board/useDragPiece';
import { ConfirmedFen, ConfirmPanel } from './editor/ConfirmPanel';
import { FenImport } from './editor/FenImport';
import { Palette, type Tool } from './editor/Palette';
import { PositionDetails, SideToMove } from './editor/PositionDetails';
import { positionFromReadings, type TileReading } from '../vision/classify';

interface FailedConfirmation {
  /** The exact draft these errors were computed for. */
  readonly draft: DraftPosition;
  readonly errors: readonly ConfirmationError[];
}

export interface AppProps {
  /** Engine factory; tests pass a fake. Defaults to the bundled Stockfish worker. */
  readonly createTransport?: () => EngineTransport;
  /** Screenshot of the visible tab; tests pass a fake. Defaults to chrome.tabs. */
  readonly captureVisibleTab?: CaptureVisibleTab;
  /** Crops the screenshot; tests pass a fake. Defaults to a canvas. */
  readonly cropImage?: CropImage;
  /** Finds the board on the screenshot; tests pass a fake. Defaults to a canvas. */
  readonly findBoard?: FindBoard;
  /** Reads the pieces on the board found; tests pass a fake. Defaults to the ONNX model. */
  readonly recognize?: Recognize;
}

/** The pieces last read from a screenshot, and the draft they were loaded as. */
interface Recognized {
  readonly readings: readonly TileReading[];
  /** The exact draft loaded; while it's still the position, nothing has been edited. */
  readonly draft: DraftPosition;
}

const COLOR_NAMES: Readonly<Record<Color, string>> = { w: 'White', b: 'Black' };

/** The line under the board: whose turn it is, or how the game against Stockfish stands. */
function turnText(sideToMove: Color, playing: Color | null, status: PlayStatus, over: boolean) {
  if (playing === null) return `${COLOR_NAMES[sideToMove]} to move`;
  const you = `You play ${COLOR_NAMES[playing]}`;
  if (over) return `${you} · Game over`;
  if (status === 'your-move') return `${you} · Your move`;
  if (status === 'thinking') return `${you} · Stockfish is thinking…`;
  return `${you} · Stockfish’s turn (its move is already in this line)`;
}

/**
 * Two modes. Set up: edit the draft and confirm it. Explore: a confirmed position on the
 * board, where only legal moves can be played and the engine analyzes the position shown.
 */
export function App({
  createTransport,
  captureVisibleTab = captureWithChrome,
  cropImage = cropWithCanvas,
  findBoard = findBoardWithCanvas,
  recognize = recognizeWithOnnx,
}: AppProps = {}) {
  const [position, setPosition] = useState<DraftPosition>(startingPosition);
  const [orientation, setOrientation] = useState<Color>('w');
  const [tool, setTool] = useState<Tool | null>(null);
  const [failure, setFailure] = useState<FailedConfirmation | null>(null);
  /** The latest screenshot, in memory only. */
  const [screenshot, setScreenshot] = useState<Screenshot | null>(null);
  const [recognized, setRecognized] = useState<Recognized | null>(null);
  /** Play vs Stockfish: Stockfish takes the side to move (so it moves first). */
  const [stockfishFirst, setStockfishFirst] = useState(false);
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

  // Playing against Stockfish: it answers at the end of a line when it's its turn.
  const playStatus = usePlayVsEngine({
    playing: explorer.playing,
    position: exploring,
    current: explorer.current,
    atLineEnd: explorer.atLineEnd,
    completed: analysis.completed,
    playEngineMove: explorer.playEngineMove,
  });

  // Arrow keys step through the moves while exploring; Home and End jump to the ends.
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
      else if (event.key === 'Home') current.goToStart();
      else if (event.key === 'End') current.goToEnd();
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

  /** Loads the pieces read from a screenshot, seen with `side` at the bottom. */
  const loadRecognized = (readings: readonly TileReading[], side: Color) => {
    const draft = withAssumedCastling(positionFromReadings(readings, side));
    setPosition(draft);
    setRecognized({ readings, draft });
  };

  const flipButton = (
    <button
      type="button"
      onClick={() => {
        const flipped = orientation === 'w' ? 'b' : 'w';
        setOrientation(flipped);
        // A recognized position nobody has edited yet is read again from the other side:
        // the screenshot was taken with the other color at the bottom.
        if (!exploring && recognized?.draft === position) {
          loadRecognized(recognized.readings, flipped);
        }
      }}
    >
      Flip board
    </button>
  );

  return (
    <>
      <h1>Chess Position Explorer</h1>
      {/* The screenshot is for setting up the position, so it's hidden while exploring the
          confirmed one; New position brings it back as it was. */}
      {!exploring && (
        <CapturePanel
          screenshot={screenshot}
          position={position}
          capture={captureVisibleTab}
          cropImage={cropImage}
          findBoard={findBoard}
          recognize={recognize}
          onChange={setScreenshot}
          onRecognized={(readings) => {
            loadRecognized(readings, orientation);
          }}
        />
      )}
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
          <p class="turn">
            {turnText(exploring.sideToMove, explorer.playing, playStatus, explorer.gameOver)}
          </p>
          <div class="toolbar">
            <button type="button" disabled={!explorer.canGoBack} onClick={explorer.back}>
              Back
            </button>
            <button type="button" disabled={!explorer.canGoForward} onClick={explorer.forward}>
              Forward
            </button>
            {flipButton}
            {explorer.playing === null ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    explorer.startPlaying(stockfishFirst);
                  }}
                >
                  Play vs Stockfish
                </button>
                <label class="toolbar-option">
                  <input
                    type="checkbox"
                    checked={stockfishFirst}
                    onChange={(event) => {
                      setStockfishFirst(event.currentTarget.checked);
                    }}
                  />{' '}
                  Stockfish moves first
                </label>
              </>
            ) : (
              <button type="button" onClick={explorer.stopPlaying}>
                Stop playing
              </button>
            )}
          </div>
          {explorer.tree && explorer.current !== null && (
            <MoveList tree={explorer.tree} current={explorer.current} onSelect={explorer.goToNode}>
              <div class="move-actions">
                <button
                  type="button"
                  disabled={explorer.inMainLine}
                  onClick={explorer.makeMainLine}
                >
                  Make main line
                </button>
                <button
                  type="button"
                  disabled={!explorer.canGoBack}
                  onClick={explorer.deleteFromHere}
                >
                  Delete from here
                </button>
              </div>
            </MoveList>
          )}
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
          <section class="confirm" aria-label="Current position">
            <button type="button" onClick={explorer.exit}>
              New position
            </button>
            <ConfirmedFen key={toFen(exploring)} position={exploring} />
          </section>
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
          <SideToMove position={position} onChange={replacePosition} />
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
          <section class="extra" aria-labelledby="extra-heading">
            <h2 id="extra-heading">Additional settings</h2>
            <PositionDetails position={position} onChange={replacePosition} />
            <FenImport onLoad={replacePosition} />
          </section>
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
