// Splits a board image into its 64 squares. Pure.
//
// Works in the cropped board image's own pixels. Each cell edge is rounded from its
// exact position (i × size / 8), so cells are 1 px apart in size at most, touch without
// gaps or overlaps, and never drift; width and height are split independently, since a
// crop isn't always exactly square. Square names follow the board's orientation (which
// side is at the bottom), the same mapping the panel's board is drawn with.

import { displayRows } from '../shared/layout';
import type { Color, Square } from '../shared/position';

export interface SquareRect {
  readonly square: Square;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The 64 squares of a board image, top-left first, row by row. */
export function boardSquares(
  size: { readonly width: number; readonly height: number },
  orientation: Color,
): SquareRect[] {
  const edges = (length: number) =>
    Array.from({ length: 9 }, (_, i) => Math.round((i * length) / 8));
  const xs = edges(size.width);
  const ys = edges(size.height);
  return displayRows(orientation).flatMap((row, r) =>
    row.map((square, c) => {
      const x = xs[c] ?? 0;
      const y = ys[r] ?? 0;
      return {
        square,
        x,
        y,
        width: (xs[c + 1] ?? 0) - x,
        height: (ys[r + 1] ?? 0) - y,
      };
    }),
  );
}
