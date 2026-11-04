// Select the board on the screenshot: drag to draw a selection, drag inside it to move
// it, drag a corner to resize it. Mouse, touch and pen; only the pointer that started a
// drag counts.

import { useEffect, useRef, useState } from 'preact/hooks';
import {
  moveSelection,
  resizeSelection,
  roundRect,
  selectionFromDrag,
  toImagePoint,
  type Corner,
  type Point,
  type Rect,
  type Size,
} from './crop';

/** Smallest selection side, in image pixels. */
const MIN_SIZE = 16;
/** Screen pixels the pointer must travel before a press starts a new selection. */
const DRAG_THRESHOLD = 4;
const CORNERS: readonly Corner[] = ['nw', 'ne', 'sw', 'se'];

export interface CropViewProps {
  readonly dataUrl: string;
  /** The previous selection, when cropping again. */
  readonly initial: Rect | null;
  /** The selection to crop, in whole image pixels. */
  readonly onCrop: (rect: Rect) => void;
  readonly onUseWhole: () => void;
}

type Gesture =
  | { readonly kind: 'draw'; readonly start: Point; readonly client: Point }
  | { readonly kind: 'move'; readonly start: Point; readonly rect: Rect }
  | { readonly kind: 'resize'; readonly corner: Corner; readonly rect: Rect };

export function CropView({ dataUrl, initial, onCrop, onUseWhole }: CropViewProps) {
  const image = useRef<HTMLImageElement>(null);
  const [natural, setNatural] = useState<Size | null>(null);
  const [selection, setSelection] = useState<Rect | null>(initial);
  const [square, setSquare] = useState(true);
  const gesture = useRef<{ pointerId: number; gesture: Gesture } | null>(null);

  // The latest values for the window listeners below.
  const latest = useRef({ natural, square });
  latest.current = { natural, square };

  const imagePoint = (event: PointerEvent): Point | null => {
    const size = latest.current.natural;
    const box = image.current?.getBoundingClientRect();
    if (!size || !box) return null;
    return toImagePoint({ x: event.clientX, y: event.clientY }, box, size);
  };

  // An image that's already loaded (e.g. from cache) may not fire load again.
  useEffect(() => {
    const element = image.current;
    if (element?.complete && element.naturalWidth > 0) {
      setNatural({ width: element.naturalWidth, height: element.naturalHeight });
    }
  }, []);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const active = gesture.current;
      const size = latest.current.natural;
      if (active?.pointerId !== event.pointerId || !size) return;
      const point = imagePoint(event);
      if (!point) return;
      const options = { square: latest.current.square, bounds: size, minSize: MIN_SIZE };
      const current = active.gesture;
      if (current.kind === 'draw') {
        const moved = Math.hypot(
          event.clientX - current.client.x,
          event.clientY - current.client.y,
        );
        if (moved >= DRAG_THRESHOLD) setSelection(selectionFromDrag(current.start, point, options));
      } else if (current.kind === 'move') {
        setSelection(
          moveSelection(current.rect, point.x - current.start.x, point.y - current.start.y, size),
        );
      } else {
        setSelection(resizeSelection(current.rect, current.corner, point, options));
      }
    };
    const onEnd = (event: PointerEvent) => {
      if (gesture.current?.pointerId === event.pointerId) gesture.current = null;
    };
    const reset = () => {
      gesture.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      window.removeEventListener('blur', reset);
    };
  }, []);

  /** Starts a gesture, unless another pointer already has one. */
  const begin = (event: PointerEvent, next: (point: Point) => Gesture) => {
    if (event.button !== 0 || gesture.current) return;
    const point = imagePoint(event);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    gesture.current = { pointerId: event.pointerId, gesture: next(point) };
  };

  const percent = (value: number, total: number) => `${String((value / total) * 100)}%`;

  return (
    <div class="crop">
      <p class="crop-hint">Drag over the board to select it.</p>
      <div
        class="crop-area"
        onPointerDown={(event) => {
          begin(event, (point) => ({
            kind: 'draw',
            start: point,
            client: { x: event.clientX, y: event.clientY },
          }));
        }}
      >
        <img
          ref={image}
          src={dataUrl}
          alt="Screenshot of the tab"
          draggable={false}
          onLoad={(event) => {
            const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
            setNatural({ width, height });
          }}
        />
        {selection && natural && (
          <div
            class="crop-selection"
            style={{
              left: percent(selection.x, natural.width),
              top: percent(selection.y, natural.height),
              width: percent(selection.width, natural.width),
              height: percent(selection.height, natural.height),
            }}
            onPointerDown={(event) => {
              begin(event, (point) => ({ kind: 'move', start: point, rect: selection }));
            }}
          >
            {CORNERS.map((corner) => (
              <span
                key={corner}
                class={`crop-handle crop-handle-${corner}`}
                data-corner={corner}
                onPointerDown={(event) => {
                  begin(event, () => ({ kind: 'resize', corner, rect: selection }));
                }}
              />
            ))}
          </div>
        )}
      </div>
      <div class="toolbar">
        <label class="toolbar-option">
          <input
            type="checkbox"
            checked={square}
            onChange={(event) => {
              setSquare(event.currentTarget.checked);
            }}
          />{' '}
          Square
        </label>
        <button
          type="button"
          disabled={!selection || !natural}
          onClick={() => {
            if (selection && natural) onCrop(roundRect(selection, natural));
          }}
        >
          Crop
        </button>
        <button type="button" onClick={onUseWhole}>
          Use whole screenshot
        </button>
      </div>
    </div>
  );
}
