import { useState } from 'preact/hooks';
import { startingPosition, type Color } from '../shared/position';
import { Board } from './board/Board';

export function App() {
  const [position] = useState(startingPosition);
  const [orientation, setOrientation] = useState<Color>('w');

  return (
    <>
      <h1>Chess Position Explorer</h1>
      <Board board={position.board} orientation={orientation} />
      <div class="toolbar">
        <button
          type="button"
          onClick={() => {
            setOrientation((current) => (current === 'w' ? 'b' : 'w'));
          }}
        >
          Flip board
        </button>
      </div>
    </>
  );
}
