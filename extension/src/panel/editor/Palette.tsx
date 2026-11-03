import type { Color, Piece, PieceType } from '../../shared/position';
import { pieceImage, pieceName } from '../board/pieceImages';
import './editor.css';

export type Tool = { readonly kind: 'piece'; readonly piece: Piece } | { readonly kind: 'eraser' };

export function isSameTool(a: Tool | null, b: Tool | null): boolean {
  if (a?.kind === 'eraser' || b?.kind === 'eraser') return a?.kind === b?.kind;
  if (!a || !b) return false;
  return a.piece.color === b.piece.color && a.piece.type === b.piece.type;
}

const PIECE_ORDER: readonly PieceType[] = ['k', 'q', 'r', 'b', 'n', 'p'];
const COLORS: readonly Color[] = ['w', 'b'];

export interface PaletteProps {
  readonly selected: Tool | null;
  /** Called with the clicked tool, or null when the selected tool is clicked again. */
  readonly onSelect: (tool: Tool | null) => void;
  /** Lets a palette piece be dragged onto the board. */
  readonly onPiecePointerDown: (piece: Piece, event: PointerEvent) => void;
}

export function Palette({ selected, onSelect, onPiecePointerDown }: PaletteProps) {
  const toggle = (tool: Tool) => {
    onSelect(isSameTool(selected, tool) ? null : tool);
  };

  return (
    <div class="palette" role="toolbar" aria-label="Pieces">
      {COLORS.map((color) => (
        <div class="palette-row" key={color}>
          {PIECE_ORDER.map((type) => {
            const piece: Piece = { color, type };
            const tool: Tool = { kind: 'piece', piece };
            return (
              <button
                key={type}
                type="button"
                class="palette-piece"
                aria-label={pieceName(piece)}
                aria-pressed={isSameTool(selected, tool)}
                onClick={() => {
                  toggle(tool);
                }}
                onPointerDown={(event) => {
                  onPiecePointerDown(piece, event);
                }}
              >
                <img src={pieceImage(piece)} alt="" draggable={false} />
              </button>
            );
          })}
        </div>
      ))}
      <button
        type="button"
        class="palette-eraser"
        aria-pressed={selected?.kind === 'eraser'}
        onClick={() => {
          toggle({ kind: 'eraser' });
        }}
      >
        Eraser
      </button>
    </div>
  );
}
