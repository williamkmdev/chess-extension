// Which square appears where on screen. Orientation is UI state, not part of the
// position: it only decides the display order of ranks and files.

import { FILES, RANKS, type Color, type Square } from './position';

/** Board rows from the top of the screen down, each row left to right. */
export function displayRows(orientation: Color): Square[][] {
  const ranks = orientation === 'w' ? [...RANKS].reverse() : [...RANKS];
  const files = orientation === 'w' ? [...FILES] : [...FILES].reverse();
  return ranks.map((rank) => files.map((file): Square => `${file}${rank}`));
}
