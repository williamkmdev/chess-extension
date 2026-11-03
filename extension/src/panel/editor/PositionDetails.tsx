import { useEffect, useState } from 'preact/hooks';
import {
  setCastlingRight,
  setEnPassant,
  setFullmoveNumber,
  setHalfmoveClock,
  setSideToMove,
} from '../../shared/editing';
import {
  CASTLING_RIGHTS,
  FILES,
  isSquare,
  type CastlingRight,
  type DraftPosition,
  type MetadataField,
} from '../../shared/position';

export const CASTLING_LABELS: Readonly<Record<CastlingRight, string>> = {
  whiteKingside: 'White O-O',
  whiteQueenside: 'White O-O-O',
  blackKingside: 'Black O-O',
  blackQueenside: 'Black O-O-O',
};

const EN_PASSANT_SQUARES = [
  ...FILES.map((file) => `${file}3`),
  ...FILES.map((file) => `${file}6`),
].filter(isSquare);

function Assumed({ field }: { field: MetadataField<unknown> }) {
  return field.source === 'default' ? <span class="assumed">assumed</span> : null;
}

export interface PositionDetailsProps {
  readonly position: DraftPosition;
  readonly onChange: (next: DraftPosition) => void;
}

export function PositionDetails({ position, onChange }: PositionDetailsProps) {
  return (
    <section class="details" aria-label="Position details">
      <fieldset>
        <legend>
          Side to move {position.sideToMove === 'unknown' && <span class="required">required</span>}
        </legend>
        {(['w', 'b'] as const).map((color) => (
          <label key={color}>
            <input
              type="radio"
              name="side-to-move"
              checked={position.sideToMove === color}
              onChange={() => {
                onChange(setSideToMove(position, color));
              }}
            />
            {color === 'w' ? 'White' : 'Black'}
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>Castling</legend>
        {CASTLING_RIGHTS.map((right) => (
          <label key={right}>
            <input
              type="checkbox"
              checked={position.castling[right].value}
              onChange={(event) => {
                onChange(setCastlingRight(position, right, event.currentTarget.checked));
              }}
            />
            {CASTLING_LABELS[right]} <Assumed field={position.castling[right]} />
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>Other</legend>
        <label>
          En passant{' '}
          <select
            value={position.enPassant.value ?? ''}
            onChange={(event) => {
              const value = event.currentTarget.value;
              onChange(setEnPassant(position, isSquare(value) ? value : null));
            }}
          >
            <option value="">None</option>
            {EN_PASSANT_SQUARES.map((square) => (
              <option key={square} value={square}>
                {square}
              </option>
            ))}
          </select>{' '}
          <Assumed field={position.enPassant} />
        </label>
        <CounterInput
          label="Halfmove clock"
          field={position.halfmoveClock}
          minimum={0}
          onCommit={(value) => {
            onChange(setHalfmoveClock(position, value));
          }}
        />
        <CounterInput
          label="Fullmove number"
          field={position.fullmoveNumber}
          minimum={1}
          onCommit={(value) => {
            onChange(setFullmoveNumber(position, value));
          }}
        />
      </fieldset>
    </section>
  );
}

interface CounterInputProps {
  readonly label: string;
  readonly field: MetadataField<number>;
  readonly minimum: number;
  readonly onCommit: (value: number) => void;
}

/**
 * Number input that only commits valid whole numbers. While the text is invalid (e.g.
 * emptied to type a new value) the last valid value stays in the position, and the
 * field snaps back to it on blur.
 */
function CounterInput({ label, field, minimum, onCommit }: CounterInputProps) {
  const [text, setText] = useState(String(field.value));
  useEffect(() => {
    setText(String(field.value));
  }, [field.value]);

  return (
    <label>
      {label}{' '}
      <input
        type="number"
        inputMode="numeric"
        min={minimum}
        step={1}
        value={text}
        onInput={(event) => {
          const next = event.currentTarget.value;
          setText(next);
          const value = Number(next);
          if (/^\d+$/.test(next) && Number.isSafeInteger(value) && value >= minimum) {
            onCommit(value);
          }
        }}
        onBlur={() => {
          setText(String(field.value));
        }}
      />{' '}
      <Assumed field={field} />
    </label>
  );
}
