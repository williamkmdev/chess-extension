import { useState } from 'preact/hooks';
import type { ConfirmationError } from '../../shared/confirm';
import { toFen } from '../../shared/fen';
import { CASTLING_RIGHTS, type ConfirmedPosition } from '../../shared/position';
import { CASTLING_LABELS } from './PositionDetails';

export interface ConfirmPanelProps {
  /** Why the current draft couldn't be confirmed; null if it hasn't failed since its last edit. */
  readonly errors: readonly ConfirmationError[] | null;
  readonly onConfirm: () => void;
}

export function ConfirmPanel({ errors, onConfirm }: ConfirmPanelProps) {
  return (
    <section class="confirm" aria-label="Confirm position">
      <button type="button" onClick={onConfirm}>
        Confirm position
      </button>
      {errors && (
        <ul class="errors" role="alert">
          {errors.map((error, index) => (
            <li key={index}>{error.message}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * A confirmed position's FEN with a Copy button, and which metadata was assumed rather
 * than stated. Give it `key={fen}` so the copy status resets when the position changes.
 */
export function ConfirmedFen({ position }: { position: ConfirmedPosition }) {
  const fen = toFen(position);
  const [status, setStatus] = useState<string | null>(null);
  const assumptions = describeAssumptions(position);

  return (
    <div class="confirmed">
      <label>
        FEN{' '}
        <input
          type="text"
          readOnly
          value={fen}
          onFocus={(event) => {
            event.currentTarget.select();
          }}
        />
      </label>{' '}
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(fen).then(
            () => {
              setStatus('Copied');
            },
            () => {
              setStatus("Couldn't copy. Select the FEN above and copy it manually.");
            },
          );
        }}
      >
        Copy
      </button>
      {status && (
        <p class="status" role="status">
          {status}
        </p>
      )}
      {assumptions.length > 0 && (
        <p class="assumptions">Assumed (not stated): {assumptions.join('; ')}.</p>
      )}
    </div>
  );
}

/** Human-readable list of metadata the user accepted as defaults. */
export function describeAssumptions(position: ConfirmedPosition): string[] {
  const items: string[] = [];
  const castling = CASTLING_RIGHTS.filter((right) => position.castling[right].source === 'default');
  if (castling.length > 0) {
    items.push(
      `castling ${castling
        .map(
          (right) => `${CASTLING_LABELS[right]} ${position.castling[right].value ? 'yes' : 'no'}`,
        )
        .join(', ')}`,
    );
  }
  if (position.enPassant.source === 'default') {
    items.push(`en passant ${position.enPassant.value ?? 'none'}`);
  }
  if (position.halfmoveClock.source === 'default') {
    items.push(`halfmove clock ${String(position.halfmoveClock.value)}`);
  }
  if (position.fullmoveNumber.source === 'default') {
    items.push(`fullmove number ${String(position.fullmoveNumber.value)}`);
  }
  return items;
}
