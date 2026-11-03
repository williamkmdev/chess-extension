import { useState } from 'preact/hooks';
import type { ConfirmResult } from '../../shared/confirm';
import { toFen } from '../../shared/fen';
import { CASTLING_RIGHTS, type ConfirmedPosition } from '../../shared/position';
import { CASTLING_LABELS } from './PositionDetails';

export interface ConfirmPanelProps {
  /** The result for the current draft, or null if it hasn't been confirmed since its last edit. */
  readonly result: ConfirmResult | null;
  readonly onConfirm: () => void;
}

export function ConfirmPanel({ result, onConfirm }: ConfirmPanelProps) {
  return (
    <section class="confirm" aria-label="Confirm position">
      <button type="button" onClick={onConfirm}>
        Confirm position
      </button>
      {result && !result.ok && (
        <ul class="errors" role="alert">
          {result.errors.map((error, index) => (
            <li key={index}>{error.message}</li>
          ))}
        </ul>
      )}
      {result?.ok && <ConfirmedFen key={toFen(result.position)} position={result.position} />}
    </section>
  );
}

function ConfirmedFen({ position }: { position: ConfirmedPosition }) {
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
