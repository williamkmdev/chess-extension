// Geometry for selecting the board on a screenshot. Pure: everything is in image
// pixels (the screenshot's own pixels), and screen positions are converted once, at
// the edge, by toImagePoint.

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Rect extends Point, Size {}

export type Corner = 'nw' | 'ne' | 'sw' | 'se';

export interface SelectionOptions {
  /** Keep the selection square (boards are square). */
  readonly square: boolean;
  /** The image: the selection never leaves it. */
  readonly bounds: Size;
  /** Smallest side in image pixels, so a crop is never empty. */
  readonly minSize: number;
}

const clamp = (value: number, low: number, high: number) =>
  Math.min(Math.max(value, low), Math.max(low, high));

/**
 * A screen position (e.g. a pointer's clientX/Y) in image pixels, given where the image
 * is displayed and its natural size. Covers any scaling, including the device pixel
 * ratio (a capture has the screen's device pixels). Clamped to the image.
 */
export function toImagePoint(
  client: Point,
  displayed: { readonly left: number; readonly top: number } & Size,
  natural: Size,
): Point {
  if (displayed.width <= 0 || displayed.height <= 0) return { x: 0, y: 0 };
  return {
    x: clamp(((client.x - displayed.left) * natural.width) / displayed.width, 0, natural.width),
    y: clamp(((client.y - displayed.top) * natural.height) / displayed.height, 0, natural.height),
  };
}

/** Moves a rect the least needed to lie inside `bounds` (it must fit). */
function keepInside(rect: Rect, bounds: Size): Rect {
  return {
    ...rect,
    x: clamp(rect.x, 0, bounds.width - rect.width),
    y: clamp(rect.y, 0, bounds.height - rect.height),
  };
}

/**
 * The selection spanned from `start` (where the press began) to `current`, in any
 * direction. With `square`, it grows from `start` towards the pointer by the larger of
 * the two distances, as far as the image allows.
 */
export function selectionFromDrag(start: Point, current: Point, options: SelectionOptions): Rect {
  const { square, bounds, minSize } = options;
  const right = current.x >= start.x;
  const down = current.y >= start.y;
  // Room from the start point to the image edge, in the direction of the drag.
  const roomX = right ? bounds.width - start.x : start.x;
  const roomY = down ? bounds.height - start.y : start.y;

  let width = Math.min(Math.abs(current.x - start.x), roomX);
  let height = Math.min(Math.abs(current.y - start.y), roomY);
  if (square) {
    width = height = Math.min(Math.max(width, height), roomX, roomY);
  }
  // Never smaller than the minimum (nor bigger than the image).
  const smallest = Math.min(minSize, bounds.width, bounds.height);
  width = Math.max(width, square ? smallest : Math.min(minSize, bounds.width));
  height = Math.max(height, square ? smallest : Math.min(minSize, bounds.height));
  if (square) width = height = Math.max(width, height);

  return keepInside(
    {
      x: right ? start.x : start.x - width,
      y: down ? start.y : start.y - height,
      width,
      height,
    },
    bounds,
  );
}

/** The selection moved by (dx, dy), stopping at the image edges. */
export function moveSelection(rect: Rect, dx: number, dy: number, bounds: Size): Rect {
  return keepInside({ ...rect, x: rect.x + dx, y: rect.y + dy }, bounds);
}

/** The selection with `corner` dragged to `point`; the opposite corner stays put. */
export function resizeSelection(
  rect: Rect,
  corner: Corner,
  point: Point,
  options: SelectionOptions,
): Rect {
  const anchor = {
    x: corner.endsWith('w') ? rect.x + rect.width : rect.x,
    y: corner.startsWith('n') ? rect.y + rect.height : rect.y,
  };
  return selectionFromDrag(anchor, point, options);
}

/** Whole pixels inside the image, for the actual crop. */
export function roundRect(rect: Rect, bounds: Size): Rect {
  const x = clamp(Math.round(rect.x), 0, bounds.width - 1);
  const y = clamp(Math.round(rect.y), 0, bounds.height - 1);
  return {
    x,
    y,
    width: clamp(Math.round(rect.width), 1, bounds.width - x),
    height: clamp(Math.round(rect.height), 1, bounds.height - y),
  };
}
