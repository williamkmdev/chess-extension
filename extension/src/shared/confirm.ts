// The gate between editing and analysis: a draft becomes a ConfirmedPosition only
// when the required metadata is known and the position is legal.

import type { ConfirmedPosition, DraftPosition } from './position';
import { validatePosition, type PositionError } from './validation';

export type ConfirmationError =
  PositionError | { readonly code: 'unknown-side-to-move'; readonly message: string };

export type ConfirmResult =
  | { readonly ok: true; readonly position: ConfirmedPosition }
  | { readonly ok: false; readonly errors: readonly ConfirmationError[] };

/**
 * Confirms a draft for FEN export and analysis. Reports every problem at once:
 * missing required metadata as well as all validation errors.
 */
export function confirmPosition(draft: DraftPosition): ConfirmResult {
  const errors: ConfirmationError[] = [];
  if (draft.sideToMove === 'unknown') {
    errors.push({
      code: 'unknown-side-to-move',
      message: 'Choose whose turn it is (White or Black).',
    });
  }
  errors.push(...validatePosition(draft));

  if (errors.length > 0 || draft.sideToMove === 'unknown') {
    return { ok: false, errors };
  }
  // The only place a ConfirmedPosition is created.
  return { ok: true, position: { ...draft, sideToMove: draft.sideToMove } as ConfirmedPosition };
}
