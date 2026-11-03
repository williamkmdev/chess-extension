// Pointer-event drag and drop for pieces (mouse, touch and pen). A press that doesn't
// move past a small threshold counts as a click on the square it started on.

import { useEffect, useRef, useState } from 'preact/hooks';
import { isSquare, type Piece, type Square } from '../../shared/position';

/** Pixels the pointer must travel before a press becomes a drag. */
const DRAG_THRESHOLD = 4;

export interface DragSource {
  /** The piece that would be dragged; undefined for an empty board square. */
  readonly piece: Piece | undefined;
  /** Board square the press started on; null when it started in the palette. */
  readonly square: Square | null;
}

export interface ActiveDrag {
  readonly piece: Piece;
  readonly from: Square | null;
  readonly x: number;
  readonly y: number;
}

export interface DragOptions {
  /** A dragged piece was released over `target` (null: off the board). */
  readonly onDrop: (drag: { piece: Piece; from: Square | null }, target: Square | null) => void;
  /** A board square was pressed and released without dragging. */
  readonly onSquareClick: (square: Square) => void;
  /** Finds the board square under a screen point; injectable for tests. */
  readonly squareAt?: (x: number, y: number) => Square | null;
}

/** The board square under a screen point, found through the squares' data-square. */
export function squareAtPoint(x: number, y: number): Square | null {
  const square = document
    .elementFromPoint(x, y)
    ?.closest('[data-square]')
    ?.getAttribute('data-square');
  return square && isSquare(square) ? square : null;
}

interface Press {
  readonly source: DragSource;
  /** Only this pointer's events count, so a second finger can't end the drag. */
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  /** Moved past the threshold: no longer a click, even if there's nothing to drag. */
  moved: boolean;
}

export function useDragPiece(options: DragOptions) {
  const [drag, setDrag] = useState<ActiveDrag | null>(null);
  const press = useRef<Press | null>(null);
  // On touch screens the release of a palette drag still targets the palette button,
  // so the browser follows it with a click there; that click must not toggle the tool.
  const paletteDragJustEnded = useRef(false);
  // Always call the latest callbacks without re-subscribing the window listeners.
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    const isActivePointer = (event: PointerEvent) =>
      press.current !== null && press.current.pointerId === event.pointerId;

    const onMove = (event: PointerEvent) => {
      const current = press.current;
      if (!current || !isActivePointer(event)) return;
      if (!current.moved) {
        const distance = Math.hypot(event.clientX - current.startX, event.clientY - current.startY);
        if (distance < DRAG_THRESHOLD) return;
        current.moved = true;
      }
      const { piece, square } = current.source;
      if (piece) setDrag({ piece, from: square, x: event.clientX, y: event.clientY });
    };

    const onUp = (event: PointerEvent) => {
      const current = press.current;
      if (!current || !isActivePointer(event)) return;
      press.current = null;
      setDrag(null);
      const { piece, square } = current.source;
      if (current.moved) {
        if (square === null) paletteDragJustEnded.current = true;
        if (!piece) return;
        const squareAt = latest.current.squareAt ?? squareAtPoint;
        latest.current.onDrop({ piece, from: square }, squareAt(event.clientX, event.clientY));
      } else if (square) {
        latest.current.onSquareClick(square);
      }
    };

    const reset = () => {
      press.current = null;
      setDrag(null);
    };
    const onCancel = (event: PointerEvent) => {
      if (isActivePointer(event)) reset();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    // Switching windows mid-drag can swallow the release; abandon the press instead.
    window.addEventListener('blur', reset);
    // A mouse drag produces no follow-up click. The touch follow-up click arrives with no
    // new press or key in between, so any new press or key ends the suppression; it
    // must never swallow a later, deliberate click (palette, Eraser, or keyboard).
    const endSuppression = () => {
      paletteDragJustEnded.current = false;
    };
    window.addEventListener('pointerdown', endSuppression, { capture: true });
    window.addEventListener('keydown', endSuppression);
    return () => {
      window.removeEventListener('pointerdown', endSuppression, { capture: true });
      window.removeEventListener('keydown', endSuppression);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('blur', reset);
    };
  }, []);

  /** Call from a pointerdown handler on a board square or palette piece. */
  const beginPress = (event: PointerEvent, source: DragSource) => {
    // Ignore other buttons, and other fingers while a press is already in progress.
    if (event.button !== 0 || press.current) return;
    press.current = {
      source,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
  };

  /**
   * True once, right after a drag from the palette ended: the palette's click handler
   * uses it to ignore the click the browser generates for that release.
   */
  const consumePaletteDragClick = () => {
    const ended = paletteDragJustEnded.current;
    paletteDragJustEnded.current = false;
    return ended;
  };

  return { drag, beginPress, consumePaletteDragClick };
}
