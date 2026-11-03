import { useState } from 'preact/hooks';
import { parseFen, type FenError, type FenField } from '../../shared/fen';
import type { DraftPosition } from '../../shared/position';

const FIELD_LABELS: Readonly<Record<FenField, string>> = {
  fen: 'FEN',
  placement: 'Pieces',
  sideToMove: 'Side to move',
  castling: 'Castling',
  enPassant: 'En passant',
  halfmoveClock: 'Halfmove clock',
  fullmoveNumber: 'Fullmove number',
};

export interface FenImportProps {
  readonly onLoad: (position: DraftPosition) => void;
}

export function FenImport({ onLoad }: FenImportProps) {
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<readonly FenError[]>([]);

  return (
    <form
      class="fen-import"
      onSubmit={(event) => {
        event.preventDefault();
        const result = parseFen(text);
        if (result.ok) {
          setErrors([]);
          onLoad(result.position);
        } else {
          setErrors(result.errors);
        }
      }}
    >
      <label>
        Load FEN{' '}
        <input
          type="text"
          value={text}
          spellcheck={false}
          placeholder="Paste a FEN"
          onInput={(event) => {
            setText(event.currentTarget.value);
          }}
        />
      </label>{' '}
      <button type="submit">Load</button>
      {errors.length > 0 && (
        <ul class="errors" role="alert">
          {errors.map((error, index) => (
            <li key={index}>
              {FIELD_LABELS[error.field]}: {error.message}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
