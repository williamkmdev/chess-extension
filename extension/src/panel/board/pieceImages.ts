// cburnett piece set by Colin M.L. Burnett, GPLv2+. See ./pieces/README.md.

import type { Piece } from '../../shared/position';
import bB from './pieces/bB.svg';
import bK from './pieces/bK.svg';
import bN from './pieces/bN.svg';
import bP from './pieces/bP.svg';
import bQ from './pieces/bQ.svg';
import bR from './pieces/bR.svg';
import wB from './pieces/wB.svg';
import wK from './pieces/wK.svg';
import wN from './pieces/wN.svg';
import wP from './pieces/wP.svg';
import wQ from './pieces/wQ.svg';
import wR from './pieces/wR.svg';

const IMAGES: Readonly<Record<string, string>> = {
  wK,
  wQ,
  wR,
  wB,
  wN,
  wP,
  bK,
  bQ,
  bR,
  bB,
  bN,
  bP,
};

export function pieceImage(piece: Piece): string {
  const image = IMAGES[`${piece.color}${piece.type.toUpperCase()}`];
  if (!image) throw new Error(`No image for piece ${piece.color}${piece.type}`);
  return image;
}

const COLOR_NAMES = { w: 'white', b: 'black' } as const;
const TYPE_NAMES = {
  k: 'king',
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
  p: 'pawn',
} as const;

/** e.g. "white knight" */
export function pieceName(piece: Piece): string {
  return `${COLOR_NAMES[piece.color]} ${TYPE_NAMES[piece.type]}`;
}
