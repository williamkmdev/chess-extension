import { useEffect, useRef } from 'preact/hooks';
import type { Color } from '../../shared/position';
import { pieceImage, pieceName } from '../board/pieceImages';
import { PROMOTION_PIECES, type PromotionPiece } from './legalMoves';

export interface PromotionPickerProps {
  readonly color: Color;
  readonly onChoose: (piece: PromotionPiece) => void;
  readonly onCancel: () => void;
}

/** Asks which piece a pawn promotes to; the move is played only once one is chosen. */
export function PromotionPicker({ color, onChoose, onCancel }: PromotionPickerProps) {
  const group = useRef<HTMLDivElement>(null);
  const cancel = useRef(onCancel);
  cancel.current = onCancel;

  useEffect(() => {
    group.current?.querySelector('button')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancel.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div ref={group} class="promotion" role="group" aria-label="Promote pawn to">
      <span>Promote to:</span>
      {PROMOTION_PIECES.map((type) => {
        const name = pieceName({ color, type });
        return (
          <button
            key={type}
            type="button"
            class="promotion-piece"
            aria-label={name}
            onClick={() => {
              onChoose(type);
            }}
          >
            <img src={pieceImage({ color, type })} alt="" />
          </button>
        );
      })}
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
