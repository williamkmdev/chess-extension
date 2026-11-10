// @vitest-environment happy-dom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeTransport } from '../engine/testing';
import { App } from './App';
import type { FindBoard } from './capture/findBoard';
import type { Recognize } from './capture/recognize';
import type { TileReading } from '../vision/classify';

const container = document.createElement('div');
/** The fake engines the app created, in order (Retry creates a new one). */
let engines: FakeTransport[] = [];

beforeEach(async () => {
  engines = [];
  document.body.append(container);
  await act(() => {
    render(
      <App
        createTransport={() => {
          const transport = new FakeTransport();
          engines.push(transport);
          return transport;
        }}
      />,
      container,
    );
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  render(null, container);
  container.remove();
});

/** A board locator that never finds a board. */
const notFound: FindBoard = () => Promise.resolve({ ok: false, reason: 'no-grid' });
/** A board locator result with the board at `rect`. */
const found = (rect: { x: number; y: number; width: number; height: number }) =>
  ({ ok: true, rect, coverage: 0.9 }) as const;

const square = (name: string) => {
  const el = container.querySelector<HTMLElement>(`[data-square="${name}"]`);
  if (!el) throw new Error(`No square ${name}`);
  return el;
};
const label = (name: string) => square(name).getAttribute('aria-label');
const pieceCount = () => container.querySelectorAll('.board img.piece').length;
const firstSquare = () => container.querySelector('[data-square]')?.getAttribute('data-square');

function button(name: string) {
  const found = [...container.querySelectorAll('button')].find(
    (b) => (b.getAttribute('aria-label') ?? b.textContent) === name,
  );
  if (!found) throw new Error(`No button '${name}'`);
  return found;
}

async function click(el: HTMLElement) {
  await act(() => {
    el.click();
  });
}

function pointer(type: string, target: EventTarget, x: number, y: number, pointerId = 1) {
  target.dispatchEvent(
    new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0, pointerId }),
  );
}

/** Press on a board square and release without moving: a click for editing tools. */
async function tap(name: string) {
  await act(() => {
    pointer('pointerdown', square(name), 0, 0);
    pointer('pointerup', window, 0, 0);
  });
}

/** Drag from an element and release over `target` (a square name, or null for off-board). */
async function dragTo(from: HTMLElement, target: string | null) {
  vi.spyOn(document, 'elementFromPoint').mockReturnValue(target ? square(target) : null);
  await act(() => {
    pointer('pointerdown', from, 0, 0);
    pointer('pointermove', window, 30, 30);
  });
  expect(container.querySelector('.drag-ghost')).not.toBeNull();
  await act(() => {
    pointer('pointerup', window, 30, 30);
  });
  expect(container.querySelector('.drag-ghost')).toBeNull();
}

describe('board setup buttons', () => {
  it('starts from the starting position', () => {
    expect(pieceCount()).toBe(32);
    expect(label('e1')).toBe('e1, white king');
  });

  it('clears the board and restores the starting position', async () => {
    await click(button('Clear board'));
    expect(pieceCount()).toBe(0);
    await click(button('Starting position'));
    expect(pieceCount()).toBe(32);
  });

  it('flips the board', async () => {
    expect(firstSquare()).toBe('a8');
    await click(button('Flip board'));
    expect(firstSquare()).toBe('h1');
  });
});

describe('click to place', () => {
  it('does nothing without a selected tool', async () => {
    await tap('e4');
    expect(label('e4')).toBe('e4, empty');
  });

  it('places the selected piece on each clicked square', async () => {
    await click(button('white knight'));
    await tap('e4');
    await tap('d5');
    expect(label('e4')).toBe('e4, white knight');
    expect(label('d5')).toBe('d5, white knight');
  });

  it('replaces a different piece and removes the same piece', async () => {
    await click(button('black queen'));
    await tap('e1');
    expect(label('e1')).toBe('e1, black queen');
    await tap('e1');
    expect(label('e1')).toBe('e1, empty');
  });

  it('erases with the eraser', async () => {
    await click(button('Eraser'));
    await tap('a1');
    await tap('h8');
    expect(label('a1')).toBe('a1, empty');
    expect(label('h8')).toBe('h8, empty');
    expect(pieceCount()).toBe(30);
  });

  it('stops placing once the tool is deselected', async () => {
    await click(button('white rook'));
    await click(button('white rook'));
    await tap('e4');
    expect(label('e4')).toBe('e4, empty');
  });

  it('places on the right square with the board flipped', async () => {
    await click(button('Flip board'));
    await click(button('black bishop'));
    await tap('c4');
    expect(label('c4')).toBe('c4, black bishop');
  });
});

describe('drag and drop', () => {
  it('moves a piece to another square', async () => {
    await dragTo(square('g1'), 'f3');
    expect(label('g1')).toBe('g1, empty');
    expect(label('f3')).toBe('f3, white knight');
    expect(pieceCount()).toBe(32);
  });

  it('captures the piece on the target square', async () => {
    await dragTo(square('d1'), 'd7');
    expect(label('d7')).toBe('d7, white queen');
    expect(pieceCount()).toBe(31);
  });

  it('removes a piece dropped off the board', async () => {
    await dragTo(square('a2'), null);
    expect(label('a2')).toBe('a2, empty');
    expect(pieceCount()).toBe(31);
  });

  it('places a piece dragged from the palette', async () => {
    await dragTo(button('black king'), 'e4');
    expect(label('e4')).toBe('e4, black king');
  });

  it('ignores a palette piece dropped off the board', async () => {
    await dragTo(button('black king'), null);
    expect(pieceCount()).toBe(32);
  });

  it('does not treat a drag as a click for the selected tool', async () => {
    await click(button('Eraser'));
    await dragTo(square('g1'), 'f3');
    expect(label('f3')).toBe('f3, white knight');
  });

  it('does not apply the tool when a press on an empty square moves away', async () => {
    await click(button('white knight'));
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(square('d5'));
    await act(() => {
      pointer('pointerdown', square('e4'), 0, 0);
      pointer('pointermove', window, 30, 30);
      pointer('pointerup', window, 30, 30);
    });
    expect(label('e4')).toBe('e4, empty');
    expect(label('d5')).toBe('d5, empty');
  });

  it('follows only the pointer that started the drag', async () => {
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(square('f3'));
    await act(() => {
      pointer('pointerdown', square('g1'), 0, 0, 1);
      pointer('pointermove', window, 30, 30, 1);
    });
    // A second finger presses another piece and lifts: the first drag continues.
    await act(() => {
      pointer('pointerdown', square('b1'), 0, 0, 2);
      pointer('pointerup', window, 0, 0, 2);
      pointer('pointercancel', window, 0, 0, 2);
    });
    expect(container.querySelector('.drag-ghost')).not.toBeNull();
    expect(label('g1')).toBe('g1, white knight');
    expect(label('b1')).toBe('b1, white knight');

    await act(() => {
      pointer('pointerup', window, 30, 30, 1);
    });
    expect(label('g1')).toBe('g1, empty');
    expect(label('f3')).toBe('f3, white knight');
    expect(label('b1')).toBe('b1, white knight');
  });

  it('ignores the click a touch drag from the palette ends with', async () => {
    await click(button('black king'));
    expect(button('black king').getAttribute('aria-pressed')).toBe('true');
    // Touch: the release stays targeted at the palette button, which then gets a click.
    await dragTo(button('black king'), 'e4');
    await click(button('black king'));
    expect(label('e4')).toBe('e4, black king');
    expect(button('black king').getAttribute('aria-pressed')).toBe('true');
    // Ordinary clicks still toggle.
    await act(() => {
      pointer('pointerdown', button('black king'), 0, 0);
      pointer('pointerup', window, 0, 0);
    });
    await click(button('black king'));
    expect(button('black king').getAttribute('aria-pressed')).toBe('false');
  });

  it('still honors a keyboard click after a mouse drag from the palette', async () => {
    await dragTo(button('white queen'), 'e4');
    await act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    });
    await click(button('white queen'));
    expect(button('white queen').getAttribute('aria-pressed')).toBe('true');
  });

  it('honors an Eraser click after a mouse drag from the palette', async () => {
    await dragTo(button('white queen'), 'e4');
    // A real mouse click on Eraser: press, release, click (no follow-up from the drag).
    await act(() => {
      pointer('pointerdown', button('Eraser'), 0, 0);
      pointer('pointerup', window, 0, 0);
    });
    await click(button('Eraser'));
    expect(button('Eraser').getAttribute('aria-pressed')).toBe('true');
  });

  it('abandons a drag when the window loses focus', async () => {
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(square('f3'));
    await act(() => {
      pointer('pointerdown', square('g1'), 0, 0);
      pointer('pointermove', window, 30, 30);
    });
    await act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(container.querySelector('.drag-ghost')).toBeNull();
    // A late release no longer applies the abandoned drag...
    await act(() => {
      pointer('pointerup', window, 30, 30);
    });
    expect(label('g1')).toBe('g1, white knight');
    // ...and new presses work.
    await dragTo(square('b1'), 'c3');
    expect(label('c3')).toBe('c3, white knight');
  });

  it('does not start a drag from an empty square', async () => {
    await act(() => {
      pointer('pointerdown', square('e4'), 0, 0);
      pointer('pointermove', window, 30, 30);
    });
    expect(container.querySelector('.drag-ghost')).toBeNull();
    await act(() => {
      pointer('pointerup', window, 30, 30);
    });
  });
});

function labeledInput(text: string): HTMLInputElement {
  const label = [...container.querySelectorAll('label')].find((l) =>
    l.textContent.trim().startsWith(text),
  );
  const el = label?.querySelector('input');
  if (!el) throw new Error(`No input labeled '${text}'`);
  return el;
}

async function loadFen(fen: string) {
  const field = labeledInput('Load FEN');
  await act(() => {
    field.value = fen;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(() => {
    field.form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

const confirmedFen = () =>
  container.querySelector<HTMLInputElement>('.confirmed input[readonly]')?.value ?? null;
const errorTexts = (selector: string) =>
  [...container.querySelectorAll(`${selector} .errors li`)].map((li) => li.textContent);
const highlighted = () =>
  [...container.querySelectorAll('.square.highlighted')].map((el) =>
    el.getAttribute('data-square'),
  );

describe('confirm and copy', () => {
  it('requires the side to move, then confirms and shows the FEN', async () => {
    await loadFen('4k3/8/8/8/8/8/8/4K3');
    await click(button('Confirm position'));
    expect(errorTexts('.confirm')).toEqual(['Choose whose turn it is (White or Black).']);
    expect(confirmedFen()).toBeNull();

    await click(labeledInput('White'));
    // The edit hides the stale result until the user confirms again.
    expect(errorTexts('.confirm')).toEqual([]);
    await click(button('Confirm position'));
    expect(confirmedFen()).toBe('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
    expect(container.querySelector('.assumptions')?.textContent).toContain('en passant none');
  });

  it('lists validation errors and highlights their squares', async () => {
    await loadFen('4k3/8/8/8/8/8/8/4R1K1 w - - 0 1');
    await click(button('Confirm position'));
    expect(errorTexts('.confirm')[0]).toContain("Black is in check but it's White's turn");
    expect(highlighted().sort()).toEqual(['e1', 'e8']);
    expect(confirmedFen()).toBeNull();
  });

  it('returns to editing the confirmed draft with Edit position', async () => {
    await click(button('Confirm position'));
    expect(confirmedFen()).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    await click(button('Edit position'));
    expect(confirmedFen()).toBeNull();
    expect(container.querySelector('.palette')).not.toBeNull();
    await dragTo(square('e2'), 'e4');
    expect(label('e4')).toBe('e4, white pawn');
  });

  it('copies the confirmed FEN to the clipboard', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await click(button('Confirm position'));
    await click(button('Copy'));
    expect(writeText).toHaveBeenCalledWith(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    );
    expect(container.querySelector('.status')?.textContent).toBe('Copied');
  });

  it('explains how to copy manually if the clipboard fails', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockRejectedValue(new Error('no'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await click(button('Confirm position'));
    await click(button('Copy'));
    expect(container.querySelector('.status')?.textContent).toContain('copy it manually');
  });
});

describe('load FEN', () => {
  it('replaces the draft with a valid FEN', async () => {
    await loadFen('8/8/8/4k3/8/8/8/4K3 b - - 3 40');
    expect(pieceCount()).toBe(2);
    expect(labeledInput('Black').checked).toBe(true);
    expect(labeledInput('Halfmove clock').value).toBe('3');
  });

  it('shows field errors and leaves the board alone for an invalid FEN', async () => {
    await loadFen('rnbqkbnr/ppppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR x');
    expect(errorTexts('.fen-import')).toEqual([
      'Pieces: Rank 7 describes 9 squares; expected 8.',
      "Side to move: Side to move must be 'w' or 'b', got 'x'.",
    ]);
    expect(pieceCount()).toBe(32);
  });
});

describe('assumed castling', () => {
  const castlingBox = (label: string) => labeledInput(label);

  it('follows the king and rook while unstated', async () => {
    await click(button('Clear board'));
    expect(castlingBox('White O-O').checked).toBe(false);
    await click(button('white king'));
    await tap('e1');
    await click(button('white rook'));
    await tap('h1');
    expect(castlingBox('White O-O').checked).toBe(true);
    expect(castlingBox('White O-O-O').checked).toBe(false);
    expect(castlingBox('White O-O').parentElement?.textContent).toContain('assumed');

    await dragTo(square('e1'), 'f1');
    expect(castlingBox('White O-O').checked).toBe(false);
  });

  it('keeps a right the user set, even when the pieces move', async () => {
    await click(button('Clear board'));
    await click(castlingBox('Black O-O-O'));
    expect(castlingBox('Black O-O-O').checked).toBe(true);
    await click(button('white king'));
    await tap('e1');
    expect(castlingBox('Black O-O-O').checked).toBe(true);
    expect(castlingBox('Black O-O-O').parentElement?.textContent).not.toContain('assumed');
  });
});

describe('exploring moves', () => {
  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
  const AFTER_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
  const squaresWith = (cls: string) =>
    [...container.querySelectorAll(`.square.${cls}`)]
      .map((el) => el.getAttribute('data-square'))
      .sort();
  const selected = () =>
    container.querySelector('[aria-selected="true"]')?.getAttribute('data-square') ?? null;
  const picker = () => container.querySelector('.promotion');
  const turn = () => container.querySelector('.turn')?.textContent;

  async function explore(fen?: string) {
    if (fen) await loadFen(fen);
    await click(button('Confirm position'));
  }

  it('enters Explore on Confirm, hiding the editor', async () => {
    await explore();
    expect(container.querySelector('.palette')).toBeNull();
    expect(container.querySelector('.details')).toBeNull();
    expect(turn()).toBe('White to move');
    expect(button('Back').disabled).toBe(true);
    expect(button('Forward').disabled).toBe(true);
  });

  it('stays in Set up when the position cannot be confirmed', async () => {
    await explore('4k3/8/8/8/8/8/8/4K3');
    expect(container.querySelector('.palette')).not.toBeNull();
    expect(errorTexts('.confirm')).toHaveLength(1);
  });

  it('plays a legal move by dragging', async () => {
    await explore();
    await dragTo(square('e2'), 'e4');
    expect(label('e4')).toBe('e4, white pawn');
    expect(label('e2')).toBe('e2, empty');
    expect(confirmedFen()).toBe(AFTER_E4);
    expect(turn()).toBe('Black to move');
    expect(squaresWith('last-move')).toEqual(['e2', 'e4']);
    expect(button('Back').disabled).toBe(false);
  });

  it('snaps an illegal drop back', async () => {
    await explore();
    await dragTo(square('e2'), 'e5');
    expect(label('e2')).toBe('e2, white pawn');
    expect(label('e5')).toBe('e5, empty');
    expect(confirmedFen()).toBe(START_FEN);
  });

  it("does not let the opponent's pieces be picked up", async () => {
    await explore();
    await act(() => {
      pointer('pointerdown', square('e7'), 0, 0);
      pointer('pointermove', window, 30, 30);
    });
    expect(container.querySelector('.drag-ghost')).toBeNull();
    await act(() => {
      pointer('pointerup', window, 30, 30);
    });
    await tap('e7');
    expect(selected()).toBeNull();
  });

  it('shows legal targets while dragging', async () => {
    await explore();
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(square('f3'));
    await act(() => {
      pointer('pointerdown', square('g1'), 0, 0);
      pointer('pointermove', window, 30, 30);
    });
    expect(squaresWith('target')).toEqual(['f3', 'h3']);
    await act(() => {
      pointer('pointerup', window, 30, 30);
    });
    expect(label('f3')).toBe('f3, white knight');
  });

  it('moves by clicking a piece, then a target', async () => {
    await explore();
    await tap('g1');
    expect(selected()).toBe('g1');
    expect(squaresWith('target')).toEqual(['f3', 'h3']);
    await tap('f3');
    expect(label('f3')).toBe('f3, white knight');
    expect(selected()).toBeNull();
    expect(squaresWith('target')).toEqual([]);
  });

  it('reselects, deselects, and ignores clicks on squares the piece cannot reach', async () => {
    await explore();
    await tap('g1');
    await tap('b1');
    expect(selected()).toBe('b1');
    await tap('b1');
    expect(selected()).toBeNull();
    await tap('g1');
    await tap('g4');
    expect(selected()).toBeNull();
    expect(confirmedFen()).toBe(START_FEN);
  });

  it('marks capturable pieces differently from empty targets', async () => {
    await explore('4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1');
    await tap('e4');
    expect(squaresWith('target')).toEqual(['d5', 'e5']);
    expect(squaresWith('capture')).toEqual(['d5']);
  });

  it('asks for the promotion piece before playing the move', async () => {
    await explore('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    await dragTo(square('a7'), 'a8');
    expect(picker()).not.toBeNull();
    // The pawn is shown on its destination while choosing, but nothing is played yet.
    expect(label('a8')).toBe('a8, white pawn');
    expect(label('a7')).toBe('a7, empty');
    expect(confirmedFen()).toBe('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');

    await click(button('white knight'));
    expect(picker()).toBeNull();
    expect(label('a8')).toBe('a8, white knight');
    expect(confirmedFen()).toBe('N3k3/8/8/8/8/8/8/4K3 b - - 0 1');
  });

  it('plays no move when the promotion is cancelled', async () => {
    await explore('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    await tap('a7');
    await tap('a8');
    expect(picker()).not.toBeNull();
    expect(label('a8')).toBe('a8, white pawn');
    await click(button('Cancel'));
    expect(picker()).toBeNull();
    expect(label('a7')).toBe('a7, white pawn');
    expect(label('a8')).toBe('a8, empty');

    await dragTo(square('a7'), 'a8');
    await act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(picker()).toBeNull();
    expect(label('a7')).toBe('a7, white pawn');
  });

  it('previews a capturing promotion, and restores the board when cancelled by a click', async () => {
    await explore('1n2k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    await dragTo(square('a7'), 'b8');
    expect(label('b8')).toBe('b8, white pawn');
    expect(label('a7')).toBe('a7, empty');

    await tap('d4');
    expect(picker()).toBeNull();
    expect(label('b8')).toBe('b8, black knight');
    expect(label('a7')).toBe('a7, white pawn');
  });

  it('goes back and forward along the line, and branches from earlier moves', async () => {
    await explore();
    await dragTo(square('e2'), 'e4');
    await dragTo(square('e7'), 'e5');
    expect(confirmedFen()).toBe(AFTER_E5);

    await click(button('Back'));
    expect(confirmedFen()).toBe(AFTER_E4);
    expect(squaresWith('last-move')).toEqual(['e2', 'e4']);
    await click(button('Back'));
    expect(confirmedFen()).toBe(START_FEN);
    expect(squaresWith('last-move')).toEqual([]);
    expect(button('Back').disabled).toBe(true);
    await click(button('Forward'));
    await click(button('Forward'));
    expect(confirmedFen()).toBe(AFTER_E5);
    expect(button('Forward').disabled).toBe(true);

    // A different reply after 1. e4 makes a branch; Forward still follows 1... e5.
    await click(button('Back'));
    await dragTo(square('c7'), 'c5');
    expect(confirmedFen()).toContain('2p5/4P3');
    await click(button('Back'));
    await click(button('Forward'));
    expect(confirmedFen()).toBe(AFTER_E5);
  });

  async function press(key: string, target: EventTarget = window, init: KeyboardEventInit = {}) {
    await act(() => {
      target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));
    });
  }

  it('steps back and forward with the arrow keys', async () => {
    await explore();
    await dragTo(square('e2'), 'e4');
    await press('ArrowLeft');
    expect(confirmedFen()).toBe(START_FEN);
    await press('ArrowRight');
    expect(confirmedFen()).toBe(AFTER_E4);
  });

  it('leaves the arrow keys alone while typing, with modifiers, or choosing a promotion', async () => {
    await explore();
    await dragTo(square('e2'), 'e4');
    const fenField = container.querySelector<HTMLInputElement>('.confirmed input');
    if (!fenField) throw new Error('No FEN field');
    await press('ArrowLeft', fenField);
    await press('ArrowLeft', window, { shiftKey: true });
    expect(confirmedFen()).toBe(AFTER_E4);

    await click(button('Edit position'));
    await explore('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    await dragTo(square('e1'), 'd1');
    await dragTo(square('e8'), 'd8');
    await dragTo(square('a7'), 'a8');
    await press('ArrowLeft');
    expect(picker()).not.toBeNull();
    expect(label('a8')).toBe('a8, white pawn');
  });

  it('allows no moves in a finished game', async () => {
    await explore('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1');
    await tap('h8');
    expect(selected()).toBeNull();
  });

  describe('move list', () => {
    const AFTER_NF3 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2';
    const listText = () => container.querySelector('.move-list')?.textContent ?? null;
    const listMove = (text: string) => {
      const found = [...container.querySelectorAll<HTMLButtonElement>('.move-list button')].find(
        (el) => el.textContent === text,
      );
      if (!found) throw new Error(`No move '${text}' in the list`);
      return found;
    };
    const currentMove = () =>
      container.querySelector('.move-list [aria-current="true"]')?.textContent ?? null;

    /** 1. e4 e5 2. Nf3, then 1... c5 as a side line; the board ends on 1... c5. */
    async function exploreWithSideLine({ confirm = true } = {}) {
      if (confirm) await explore();
      await dragTo(square('e2'), 'e4');
      await dragTo(square('e7'), 'e5');
      await dragTo(square('g1'), 'f3');
      await click(button('Back'));
      await click(button('Back'));
      await dragTo(square('c7'), 'c5');
    }

    it('appears with the first move and shows side lines in parentheses', async () => {
      await explore();
      expect(listText()).toBeNull();
      await exploreWithSideLine({ confirm: false });
      expect(listText()).toBe('1. e4 e5 (1... c5) 2. Nf3');
      expect(currentMove()).toBe('1... c5');
      expect(listMove('1... c5').classList.contains('side-line')).toBe(true);
    });

    it('jumps to any move, including into side lines', async () => {
      await exploreWithSideLine();
      await click(listMove('2. Nf3'));
      expect(confirmedFen()).toBe(AFTER_NF3);
      expect(currentMove()).toBe('2. Nf3');
      await click(listMove('1... c5'));
      expect(confirmedFen()).toContain('2p5/4P3');
    });

    it('makes a side line the main line, which Forward then follows', async () => {
      await exploreWithSideLine();
      expect(button('Make main line').disabled).toBe(false);
      await click(button('Make main line'));
      expect(listText()).toBe('1. e4 c5 (1... e5 2. Nf3)');
      expect(button('Make main line').disabled).toBe(true);

      await press('Home');
      await click(button('Forward'));
      await click(button('Forward'));
      expect(confirmedFen()).toContain('2p5/4P3');
    });

    it('deletes the current move and what follows, going to the move before', async () => {
      await exploreWithSideLine();
      await click(listMove('e5'));
      await click(button('Delete from here'));
      expect(listText()).toBe('1. e4 c5');
      expect(confirmedFen()).toBe(AFTER_E4);
      expect(currentMove()).toBe('1. e4');

      await press('Home');
      expect(button('Delete from here').disabled).toBe(true);
    });

    it('jumps to the start and the end of the line with Home and End', async () => {
      await exploreWithSideLine();
      await press('Home');
      expect(confirmedFen()).toBe(START_FEN);
      await press('End');
      expect(confirmedFen()).toBe(AFTER_NF3);
    });
  });

  it('labels the assumptions of the position being explored', async () => {
    await explore('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w');
    await dragTo(square('g1'), 'f3');
    const note = container.querySelector('.assumptions')?.textContent ?? '';
    expect(note).toContain('castling');
    expect(note).not.toContain('en passant');
  });
});

describe('engine analysis', () => {
  const engine = (index = 0) => {
    const found = engines[index];
    if (!found) throw new Error(`Engine ${String(index)} was not created`);
    return found;
  };
  const analysisText = () =>
    container.querySelector('[aria-label="Engine analysis"]')?.textContent ?? null;
  const comparisonText = () =>
    container.querySelector('[aria-label="Compared with Stockfish"]')?.textContent ?? null;
  /** Let the fake engine's handshake (microtasks) and the resulting renders finish. */
  const settle = async () => {
    await act(async () => {
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
    });
  };
  async function emit(...lines: string[]) {
    await act(() => {
      engine(engines.length - 1).emit(...lines);
    });
    await settle();
  }

  it('does not start the engine until a position is confirmed', () => {
    expect(engines).toHaveLength(0);
    expect(analysisText()).toBeNull();
  });

  it('analyzes the confirmed position and shows evaluation, depth and line', async () => {
    await click(button('Confirm position'));
    await settle();
    expect(engine().searchCommands).toEqual([
      'position fen rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      'go depth 20',
    ]);
    expect(analysisText()).toContain('Analyzing…');

    await emit('info depth 12 multipv 1 score cp 31 nodes 9000 time 80 pv e2e4 e7e5 g1f3 b8c6');
    expect(analysisText()).toContain('+0.31');
    expect(analysisText()).toContain('White’s perspective');
    expect(analysisText()).toContain('Depth 12/20');
    expect(analysisText()).toContain('1. e4 e5 2. Nf3 Nc6');

    await emit('info depth 20 score cp 28 pv d2d4 d7d5', 'bestmove d2d4');
    expect(analysisText()).toContain('+0.28');
    expect(analysisText()).toContain('Depth 20/20 · done');
  });

  it("shows mates and Black-to-move scores from White's perspective", async () => {
    await loadFen('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2');
    await click(button('Confirm position'));
    await settle();
    await emit('info depth 4 score mate 1 pv d8h4');
    expect(analysisText()).toContain('Mate in 1 for Black');
    expect(analysisText()).toContain('2... Qh4#');
  });

  it('stops the search and clears the analysis when going back to editing', async () => {
    await click(button('Confirm position'));
    await settle();
    await emit('info depth 5 score cp 20 pv e2e4');
    await click(button('Edit position'));
    expect(analysisText()).toBeNull();
    expect(engine().searchCommands.at(-1)).toBe('stop');

    // Output from the stopped search never shows up later.
    await emit('info depth 6 score cp 99 pv d2d4', 'bestmove d2d4');
    expect(analysisText()).toBeNull();
  });

  it('analyzes each position the board shows, dropping the previous search', async () => {
    await click(button('Confirm position'));
    await settle();
    await dragTo(square('e2'), 'e4');
    await settle();
    expect(engine().searchCommands.slice(-1)).toEqual(['stop']);
    await emit('info depth 9 score cp 50 pv d2d4', 'bestmove d2d4');
    expect(engine().searchCommands.slice(-2)).toEqual([
      'position fen rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      'go depth 20',
    ]);
    expect(analysisText()).not.toContain('+0.50');

    // Black to move: the engine's +30 for Black is shown from White's side.
    await emit('info depth 10 score cp 30 pv e7e5 g1f3');
    expect(analysisText()).toContain('−0.30');
    expect(analysisText()).toContain('1... e5 2. Nf3');

    await click(button('Back'));
    await settle();
    expect(analysisText()).not.toContain('1... e5');
    expect(engines).toHaveLength(1);
  });

  describe('comparing a move with Stockfish’s choice', () => {
    const START_SEARCH = 'position fen rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const searchesOf = (command: string) =>
      engine().searchCommands.filter((sent) => sent === command).length;

    async function confirmStartAndFinish(bestLine = 'e2e4 e7e5') {
      await click(button('Confirm position'));
      await settle();
      await emit(`info depth 20 score cp 35 pv ${bestLine}`, `bestmove ${bestLine.slice(0, 4)}`);
    }

    it('compares once both positions are searched, reusing a finished search', async () => {
      await confirmStartAndFinish();
      await dragTo(square('a2'), 'a3');
      await settle();
      expect(comparisonText()).toContain('analyzing the position after your move');

      // Black to move: −10 for Black is +0.10 for White.
      await emit('info depth 20 score cp -10 pv e7e5', 'bestmove e7e5');
      const text = comparisonText() ?? '';
      expect(text).toContain('Your move: 1. a3 +0.10');
      expect(text).toContain('Stockfish’s choice: 1. e4 +0.35');
      expect(text).toContain('a3 is 0.25 pawns worse for White than Stockfish’s choice.');
      // The starting position had been searched to the end, so it isn't searched again.
      expect(searchesOf(START_SEARCH)).toBe(1);
    });

    it('searches the position before the move afterwards if its search was cut short', async () => {
      await click(button('Confirm position'));
      await settle();
      await emit('info depth 8 score cp 30 pv e2e4');
      await dragTo(square('a2'), 'a3');
      await settle();
      // The interrupted search ends; the position after the move comes first.
      await emit('bestmove e2e4');
      await emit('info depth 20 score cp -5 pv e7e5', 'bestmove e7e5');
      expect(comparisonText()).toContain('analyzing the position before your move');
      expect(engine().searchCommands.slice(-2)).toEqual([START_SEARCH, 'go depth 20']);

      await emit('info depth 20 score cp 40 pv e2e4 e7e5', 'bestmove e2e4');
      expect(comparisonText()).toContain('a3 is 0.35 pawns worse for White');
      // The panel's own analysis still shows the position on the board.
      expect(analysisText()).toContain('+0.05');
      expect(analysisText()).not.toContain('+0.40');
    });

    it('recognizes Stockfish’s own choice', async () => {
      await confirmStartAndFinish();
      await dragTo(square('e2'), 'e4');
      await settle();
      await emit('info depth 20 score cp -30 pv e7e5', 'bestmove e7e5');
      expect(comparisonText()).toContain('e4 is Stockfish’s choice.');
    });

    it('shows no comparison at the start, and reuses finished searches going back', async () => {
      await confirmStartAndFinish();
      await dragTo(square('a2'), 'a3');
      await settle();
      await emit('info depth 20 score cp -10 pv e7e5', 'bestmove e7e5');
      const sent = engine().searchCommands.length;

      await click(button('Back'));
      await settle();
      expect(comparisonText()).toBeNull();
      expect(analysisText()).toContain('+0.35');
      expect(analysisText()).toContain('done');
      expect(engine().searchCommands).toHaveLength(sent);
    });

    it('describes mates from the mover’s side, including a move that mates', async () => {
      await loadFen('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2');
      await click(button('Confirm position'));
      await settle();
      await emit('info depth 20 score mate 1 pv d8h4', 'bestmove d8h4');

      await dragTo(square('b8'), 'c6');
      await settle();
      await emit('info depth 20 score cp 150 pv a2a3', 'bestmove a2a3');
      expect(comparisonText()).toContain('Stockfish’s choice: 2... Qh4# Mate in 1 for Black');
      expect(comparisonText()).toContain('Nc6 misses mate in 1.');

      await click(button('Back'));
      await dragTo(square('d8'), 'h4');
      await settle();
      expect(comparisonText()).toContain('Your move: 2... Qh4# Checkmate: Black wins');
      expect(comparisonText()).toContain('Qh4# is Stockfish’s choice.');
    });
  });

  describe('stepping through the engine line', () => {
    const AFTER_NF3 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2';
    const AFTER_NC6 = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';

    it('puts the board on a clicked move, then steps through the rest', async () => {
      await click(button('Confirm position'));
      await settle();
      await emit('info depth 10 score cp 30 pv e2e4 e7e5 g1f3 b8c6');
      await click(button('Play 2. Nf3'));
      expect(confirmedFen()).toBe(AFTER_NF3);

      await click(button('Forward'));
      expect(confirmedFen()).toBe(AFTER_NC6);
      expect(button('Forward').disabled).toBe(true);
      await click(button('Back'));
      await click(button('Back'));
      await click(button('Back'));
      expect(confirmedFen()).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
    });

    it("plays Stockfish's reply to your move", async () => {
      await click(button('Confirm position'));
      await settle();
      await emit('bestmove e2e4');
      await dragTo(square('e2'), 'e4');
      await settle();
      await emit('info depth 10 score cp -30 pv e7e5 g1f3');
      await click(button('Play 1... e5'));
      expect(confirmedFen()).toBe('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
    });

    it('keeps the existing main line for Forward when the engine line branches off', async () => {
      await click(button('Confirm position'));
      await settle();
      await dragTo(square('e2'), 'e4');
      await dragTo(square('c7'), 'c5');
      await click(button('Back'));
      await click(button('Back'));
      // The first search ends; the starting position is searched again.
      await emit('bestmove e2e4');
      await emit('info depth 10 score cp 30 pv e2e4 e7e5 g1f3');
      await click(button('Play 1. e4'));
      await click(button('Forward'));
      expect(confirmedFen()).toContain('2p5/4P3');
    });
  });

  describe('playing against Stockfish', () => {
    const START_POSITION = 'position fen rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    const AFTER_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    const AFTER_D4 = 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1';
    const turn = () => container.querySelector('.turn')?.textContent ?? null;
    const lastSearch = () =>
      engine()
        .searchCommands.filter((command) => command.startsWith('position'))
        .at(-1);

    /** Ends any stopped search until the engine is searching `fen`, then finishes it. */
    async function finishSearch(fen: string, bestMove: string) {
      for (let i = 0; i < 5 && lastSearch() !== `position fen ${fen}`; i += 1) {
        await emit('bestmove a2a3');
      }
      expect(lastSearch()).toBe(`position fen ${fen}`);
      await emit(`info depth 20 score cp 0 pv ${bestMove}`, `bestmove ${bestMove}`);
    }

    async function startPlaying() {
      await click(button('Confirm position'));
      await settle();
      await click(button('Play vs Stockfish'));
    }

    it('answers your move once its search of the position has finished', async () => {
      await startPlaying();
      expect(turn()).toBe('You play White · Your move');
      expect(button('Stop playing')).toBeTruthy();

      await dragTo(square('e2'), 'e4');
      await settle();
      expect(turn()).toBe('You play White · Stockfish is thinking…');
      await finishSearch(AFTER_E4, 'e7e5');
      expect(confirmedFen()).toBe(AFTER_E5);
      expect(turn()).toBe('You play White · Your move');
      expect(container.querySelector('.move-list')?.textContent).toBe('1. e4 e5');
    });

    it('lets Stockfish take the side to move when asked, so it moves first', async () => {
      await click(button('Confirm position'));
      await settle();
      const box = labeledInput('Stockfish moves first');
      expect(box.checked).toBe(false);
      await click(box);
      await click(button('Play vs Stockfish'));
      expect(turn()).toBe('You play Black · Stockfish is thinking…');

      await finishSearch(START_POSITION.slice('position fen '.length), 'e2e4');
      expect(confirmedFen()).toBe(AFTER_E4);
      expect(turn()).toBe('You play Black · Your move');
    });

    it("lets you move only your own side's pieces", async () => {
      await startPlaying();
      await dragTo(square('e2'), 'e4');
      await settle();
      await tap('e7');
      await tap('e5');
      expect(confirmedFen()).toBe(AFTER_E4);
      expect(container.querySelectorAll('.square.target')).toHaveLength(0);
    });

    it('replies at once from a search that already finished', async () => {
      await click(button('Confirm position'));
      await settle();
      await dragTo(square('e2'), 'e4');
      await settle();
      await finishSearch(AFTER_E4, 'e7e5');
      await click(button('Back'));
      await settle();
      await click(button('Play vs Stockfish'));
      const searches = engine().searchCommands.filter((c) => c === `position fen ${AFTER_E4}`);

      await dragTo(square('e2'), 'e4');
      await settle();
      expect(confirmedFen()).toBe(AFTER_E5);
      expect(engine().searchCommands.filter((c) => c === `position fen ${AFTER_E4}`)).toEqual(
        searches,
      );
    });

    it('does not move when you go back into the game, but answers a new branch', async () => {
      await startPlaying();
      await dragTo(square('e2'), 'e4');
      await settle();
      await finishSearch(AFTER_E4, 'e7e5');

      await click(button('Back'));
      await settle();
      expect(confirmedFen()).toBe(AFTER_E4);
      expect(turn()).toContain('its move is already in this line');

      await click(button('Back'));
      await settle();
      await dragTo(square('d2'), 'd4');
      await settle();
      await finishSearch(AFTER_D4, 'd7d5');
      expect(confirmedFen()).toBe('rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 2');
      expect(container.querySelector('.move-list')?.textContent).toBe('1. e4 (1. d4 d5) 1... e5');
    });

    it('plays nothing for a position you have already left', async () => {
      await startPlaying();
      await dragTo(square('e2'), 'e4');
      await settle();
      await click(button('Back'));
      await settle();
      await emit('info depth 20 score cp 0 pv e7e5', 'bestmove e7e5');
      await emit('bestmove e7e5');
      expect(confirmedFen()).toBe(START_POSITION.slice('position fen '.length));
      expect(turn()).toBe('You play White · Your move');
    });

    it('lets a move made just as Stockfish finishes win over its reply', async () => {
      await startPlaying();
      await dragTo(square('e2'), 'e4');
      await settle();
      for (let i = 0; i < 5 && lastSearch() !== `position fen ${AFTER_E4}`; i += 1) {
        await emit('bestmove a2a3');
      }
      // The search finishes and renders, but the reply's effect hasn't run when Back is
      // clicked (outside act(), as in the browser between a render and its effects).
      engine().emit('info depth 20 score cp 0 pv e7e5', 'bestmove e7e5');
      for (let i = 0; i < 20; i += 1) await Promise.resolve();
      button('Back').click();
      await settle();
      expect(confirmedFen()).toBe(START_POSITION.slice('position fen '.length));
    });

    it('lets Stop playing, clicked just as Stockfish finishes, win over its reply', async () => {
      await startPlaying();
      await dragTo(square('e2'), 'e4');
      await settle();
      for (let i = 0; i < 5 && lastSearch() !== `position fen ${AFTER_E4}`; i += 1) {
        await emit('bestmove a2a3');
      }
      engine().emit('info depth 20 score cp 0 pv e7e5', 'bestmove e7e5');
      for (let i = 0; i < 20; i += 1) await Promise.resolve();
      button('Stop playing').click();
      await settle();
      expect(confirmedFen()).toBe(AFTER_E4);
    });

    it('stops answering after Stop playing, and frees both sides again', async () => {
      await startPlaying();
      await dragTo(square('e2'), 'e4');
      await settle();
      await click(button('Stop playing'));
      await finishSearch(AFTER_E4, 'e7e5');
      expect(confirmedFen()).toBe(AFTER_E4);
      expect(turn()).toBe('Black to move');
      await dragTo(square('e7'), 'e5');
      expect(confirmedFen()).toBe(AFTER_E5);
    });

    it('stops playing when going back to edit the position', async () => {
      await startPlaying();
      await click(button('Edit position'));
      await click(button('Confirm position'));
      expect(turn()).toBe('White to move');
      expect(button('Play vs Stockfish')).toBeTruthy();
    });

    it('plays the side to move, and ends the game at checkmate', async () => {
      await loadFen('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2');
      await startPlaying();
      expect(turn()).toBe('You play Black · Your move');
      await dragTo(square('d8'), 'h4');
      await settle();
      expect(turn()).toBe('You play Black · Game over');
      expect(analysisText()).toContain('Checkmate: Black wins');
    });
  });

  it('reuses the running engine for the next confirmation', async () => {
    await click(button('Confirm position'));
    await settle();
    await emit('bestmove e2e4');
    await click(button('Edit position'));
    await dragTo(square('e2'), 'e4');
    await click(labeledInput('Black'));
    await click(button('Confirm position'));
    await settle();
    expect(engines).toHaveLength(1);
    expect(engine().searchCommands.at(-1)).toBe('go depth 20');
  });

  it('shows checkmate and stalemate without asking the engine', async () => {
    await loadFen('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1');
    await click(button('Confirm position'));
    await settle();
    expect(analysisText()).toContain('Checkmate: White wins');
    await click(button('Edit position'));
    await loadFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    await click(button('Confirm position'));
    await settle();
    expect(analysisText()).toContain('Stalemate');
    expect(engines).toHaveLength(0);
  });

  it('reports a failed engine and starts a fresh one on Retry', async () => {
    await click(button('Confirm position'));
    await act(() => {
      engine().crash('The engine failed to load.');
    });
    await settle();
    expect(analysisText()).toContain('Engine unavailable: The engine failed to load.');
    expect(engine().terminated).toBe(true);

    await click(button('Retry'));
    await settle();
    expect(engines).toHaveLength(2);
    expect(engine(1).searchCommands.at(-1)).toBe('go depth 20');
    await emit('info depth 3 score cp 10 pv e2e4');
    expect(analysisText()).toContain('+0.10');
  });

  it('treats an engine that goes completely silent mid-search as hung', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await click(button('Confirm position'));
    await settle();
    await emit('info depth 5 score cp 20 pv e2e4');
    await act(() => {
      vi.advanceTimersByTime(29_000);
    });
    expect(analysisText()).toContain('+0.20');
    await act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(analysisText()).toContain('Engine unavailable: The engine stopped responding.');
    expect(engine().terminated).toBe(true);
  });

  it('keeps a slow search alive while the engine reports progress', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await click(button('Confirm position'));
    await settle();
    await emit('info depth 18 score cp 25 pv e2e4');
    // A long iteration: no new depth for 80 s, only progress lines.
    for (let i = 0; i < 4; i += 1) {
      await act(() => {
        vi.advanceTimersByTime(20_000);
      });
      await emit('info depth 19 currmove g1f3 currmovenumber 3');
    }
    expect(analysisText()).toContain('Depth 18/20');
    expect(engine().terminated).toBe(false);
    await emit('info depth 19 score cp 27 pv e2e4 e7e5');
    expect(analysisText()).toContain('Depth 19/20');
  });

  it('reports an engine that died while idle as soon as it is next used', async () => {
    await click(button('Confirm position'));
    await settle();
    await emit('bestmove e2e4');
    await act(() => {
      engine().crash('Worker crashed.');
    });
    await dragTo(square('e2'), 'e4');
    await settle();
    expect(analysisText()).toContain('Engine unavailable: Worker crashed.');
  });

  it('reports a worker that cannot even be created', async () => {
    await act(() => {
      render(null, container);
    });
    await act(() => {
      render(
        <App
          createTransport={() => {
            throw new Error('Workers are not available.');
          }}
        />,
        container,
      );
    });
    await click(button('Confirm position'));
    await settle();
    expect(analysisText()).toContain('Engine unavailable: Workers are not available.');
  });

  it('shuts the engine down when the panel closes', async () => {
    await click(button('Confirm position'));
    await settle();
    await act(() => {
      render(null, container);
    });
    await settle();
    expect(engine().sent.at(-1)).toBe('quit');
    expect(engine().terminated).toBe(true);
  });
});

describe('screenshot', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgo=';
  /** The screenshot, whether shown on its own or being cropped. */
  const shown = () => container.querySelector<HTMLImageElement>('.screenshot img, .crop-area img');
  const alertText = () => container.querySelector('.capture-error')?.textContent ?? null;

  /** Click Capture and let the capture's promise settle. */
  async function capture(name = 'Capture tab') {
    await click(button(name));
    await act(async () => {
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
    });
  }

  async function renderWith(capture: () => Promise<string>) {
    await act(() => {
      render(null, container);
    });
    await act(() => {
      render(<App captureVisibleTab={capture} findBoard={notFound} />, container);
    });
  }

  it('captures only when asked, and shows the screenshot', async () => {
    const fake = vi.fn(() => Promise.resolve(PNG));
    await renderWith(fake);
    expect(fake).not.toHaveBeenCalled();
    expect(shown()).toBeNull();

    await capture();
    expect(fake).toHaveBeenCalledTimes(1);
    expect(shown()?.getAttribute('src')).toBe(PNG);
    expect(button('Capture tab')).toBeTruthy();
  });

  it('shows that it is capturing, and blocks a second click meanwhile', async () => {
    let finish: (url: string) => void = () => undefined;
    await renderWith(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    await click(button('Capture tab'));
    expect(container.querySelector('.capture-status')?.textContent).toBe('Capturing…');
    expect(button('Capture tab').disabled).toBe(true);

    await act(async () => {
      finish(PNG);
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
    });
    expect(container.querySelector('.capture-status')).toBeNull();
    expect(shown()).not.toBeNull();
  });

  it('does not bring back a removed screenshot when a pending capture finishes', async () => {
    let finish: (url: string) => void = () => undefined;
    let calls = 0;
    await renderWith(() => {
      calls += 1;
      return calls === 1
        ? Promise.resolve(PNG)
        : new Promise<string>((resolve) => {
            finish = resolve;
          });
    });
    await capture();
    await click(button('Capture tab'));
    await click(button('Remove screenshot'));
    await act(async () => {
      finish('data:image/png;base64,second');
      await Promise.resolve();
    });
    expect(shown()).toBeNull();
    expect(container.querySelector('.capture-status')).toBeNull();
    expect(button('Capture tab').disabled).toBe(false);
  });

  it('explains a capture Chrome refused', async () => {
    await renderWith(() =>
      Promise.reject(new Error("Either the '<all_urls>' or 'activeTab' permission is required.")),
    );
    await capture();
    expect(alertText()).toContain('toolbar icon');
    expect(shown()).toBeNull();
  });

  it('hides the screenshot while exploring, and shows it again on Edit position', async () => {
    await renderWith(() => Promise.resolve(PNG));
    await capture();
    await click(button('Confirm position'));
    expect(container.querySelector('.capture')).toBeNull();
    expect(() => button('Capture tab')).toThrow();

    await click(button('Edit position'));
    expect(shown()?.getAttribute('src')).toBe(PNG);
    expect(button('Capture tab')).toBeTruthy();
  });

  it('removes the screenshot', async () => {
    await renderWith(() => Promise.resolve(PNG));
    await capture();
    await click(button('Remove screenshot'));
    expect(shown()).toBeNull();
    expect(button('Capture tab')).toBeTruthy();
  });
});

const NOT_IN_SHOT = 'Board not found. Try cropping around it.';
const NOT_IN_CROP = 'Board not found. Try cropping closer around it.';
const noteText = () => container.querySelector('.capture-note')?.textContent ?? null;
const outline = () => container.querySelector<HTMLElement>('.board-outline');
const LOADED = 'Board found. Position loaded: set the side to move and check the pieces.';

/**
 * What the piece model would read on a board showing `placement` (FEN-like rows, as
 * seen on screen from the top), in screen order.
 */
function screenReadings(placement: string): TileReading[] {
  return placement.split('/').flatMap((row) =>
    Array.from(row).flatMap((char): TileReading[] => {
      if (/\d/.test(char)) {
        return Array.from({ length: Number(char) }, () => ({ piece: null, confidence: 0.99 }));
      }
      const type = char.toLowerCase() as 'k' | 'q' | 'r' | 'b' | 'n' | 'p';
      return [{ piece: { color: char === type ? 'b' : 'w', type }, confidence: 0.99 }];
    }),
  );
}
/** A board with only two kings, White's at the bottom of the screen. */
const KINGS = '4k3/8/8/8/8/8/8/4K3';
const readsKings: Recognize = () => Promise.resolve({ ok: true, readings: screenReadings(KINGS) });
const hasButton = (name: string) =>
  [...container.querySelectorAll('button')].some((el) => el.textContent === name);

/** Let pending captures, crops and board searches settle. */
async function flush() {
  await act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });
}

describe('choosing the area to search', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgo=';
  const CROPPED = 'data:image/png;base64,cropped';
  let cropImage: ReturnType<typeof vi.fn<(dataUrl: string, rect: unknown) => Promise<string>>>;
  let findBoard: ReturnType<typeof vi.fn<FindBoard>>;

  const cropArea = () => {
    const el = container.querySelector<HTMLElement>('.crop-area');
    if (!el) throw new Error('Not selecting');
    return el;
  };
  const selectionBox = () => container.querySelector<HTMLElement>('.crop-selection');
  const result = () => container.querySelector<HTMLImageElement>('.screenshot img');

  beforeEach(async () => {
    cropImage = vi.fn(() => Promise.resolve(CROPPED));
    findBoard = vi.fn(notFound);
    await act(() => {
      render(null, container);
    });
    await act(() => {
      render(
        <App
          captureVisibleTab={() => Promise.resolve(PNG)}
          cropImage={cropImage}
          findBoard={findBoard}
          recognize={readsKings}
        />,
        container,
      );
    });
    await click(button('Capture tab'));
    await flush();
    await openCrop();
  });

  async function openCrop() {
    await click(button('Crop'));
    await prepareImage();
  }

  /** The image: 2000×1000 pixels, shown as 400×200 at (10, 20). */
  async function prepareImage() {
    const image = cropArea().querySelector('img');
    if (!image) throw new Error('No image');
    Object.defineProperty(image, 'naturalWidth', { value: 2000 });
    Object.defineProperty(image, 'naturalHeight', { value: 1000 });
    vi.spyOn(image, 'getBoundingClientRect').mockReturnValue({
      left: 10,
      top: 20,
      width: 400,
      height: 200,
      right: 410,
      bottom: 220,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    });
    await act(() => {
      image.dispatchEvent(new Event('load'));
    });
  }

  /** Press on `target` at screen (x1, y1), drag to (x2, y2) and release. */
  async function drag(target: Element, x1: number, y1: number, x2: number, y2: number, id = 1) {
    await act(() => {
      pointer('pointerdown', target, x1, y1, id);
      pointer('pointermove', window, x2, y2, id);
      pointer('pointerup', window, x2, y2, id);
    });
  }

  async function cropNow() {
    await click(button('Crop'));
    await flush();
  }

  it('opens on Crop, with Crop waiting for a selection', () => {
    expect(container.querySelector('.crop')?.textContent).toContain('Drag a box around the board');
    expect(button('Crop').disabled).toBe(true);
    expect(labeledInput('Square').checked).toBe(true);
    // Only the selection's own Crop button; the toolbar's is hidden meanwhile.
    expect(
      [...container.querySelectorAll('button')].filter((el) => el.textContent === 'Crop'),
    ).toHaveLength(1);
  });

  it('searches the dragged square, in the screenshot’s own pixels, and shows it', async () => {
    // Screen (60, 40) → image (250, 100); a 100×60 screen drag → a 500 px square.
    await drag(cropArea(), 60, 40, 160, 100);
    expect(selectionBox()?.style.width).toBe('25%');
    expect(selectionBox()?.style.height).toBe('50%');
    await cropNow();
    expect(findBoard).toHaveBeenLastCalledWith(PNG, { x: 250, y: 100, width: 500, height: 500 });
    expect(cropImage).toHaveBeenCalledWith(PNG, { x: 250, y: 100, width: 500, height: 500 });
    expect(result()?.getAttribute('src')).toBe(CROPPED);
    expect(container.querySelector('.crop-area')).toBeNull();
    expect(noteText()).toBe(NOT_IN_CROP);
    expect(outline()).toBeNull();
  });

  it('outlines the board found in the area, leaving the crop as drawn', async () => {
    findBoard.mockResolvedValueOnce(found({ x: 300, y: 150, width: 400, height: 400 }));
    await drag(cropArea(), 60, 40, 160, 100);
    await cropNow();
    expect(cropImage).toHaveBeenCalledTimes(1);
    expect(cropImage).toHaveBeenCalledWith(PNG, { x: 250, y: 100, width: 500, height: 500 });
    expect(result()?.getAttribute('src')).toBe(CROPPED);
    expect(noteText()).toBe(LOADED);
    // The board is at (50, 50)–(450, 450) of the 500 px crop.
    expect(outline()?.style.left).toBe('10%');
    expect(outline()?.style.top).toBe('10%');
    expect(outline()?.style.width).toBe('80%');
    expect(outline()?.style.height).toBe('80%');
  });

  it('draws any rectangle with Square off', async () => {
    await click(labeledInput('Square'));
    await drag(cropArea(), 60, 40, 160, 100);
    await cropNow();
    expect(cropImage).toHaveBeenCalledWith(PNG, { x: 250, y: 100, width: 500, height: 300 });
  });

  it('moves the selection and resizes it by a corner', async () => {
    await click(labeledInput('Square'));
    await drag(cropArea(), 60, 40, 160, 100);
    const box = selectionBox();
    if (!box) throw new Error('No selection');
    // Move right by 20 screen px (100 image px).
    await drag(box, 100, 60, 120, 60);
    // Then drag the bottom-right corner (now at image (850, 400)) to image (900, 450).
    const corner = box.querySelector('[data-corner="se"]');
    if (!corner) throw new Error('No corner');
    await drag(corner, 180, 100, 190, 110);
    await cropNow();
    expect(cropImage).toHaveBeenCalledWith(PNG, { x: 350, y: 100, width: 550, height: 350 });
  });

  it('ignores a second pointer while one is dragging', async () => {
    await click(labeledInput('Square'));
    await act(() => {
      pointer('pointerdown', cropArea(), 60, 40, 1);
      pointer('pointermove', window, 160, 100, 1);
      pointer('pointerdown', cropArea(), 300, 150, 2);
      pointer('pointermove', window, 400, 200, 2);
      pointer('pointerup', window, 160, 100, 1);
    });
    await cropNow();
    expect(cropImage).toHaveBeenCalledWith(PNG, { x: 250, y: 100, width: 500, height: 300 });
  });

  it('does not start a selection from a click without a drag', async () => {
    await drag(cropArea(), 60, 40, 61, 41);
    expect(selectionBox()).toBeNull();
  });

  it('closes on Cancel, changing nothing', async () => {
    await click(button('Cancel'));
    expect(container.querySelector('.crop-area')).toBeNull();
    expect(result()?.getAttribute('src')).toBe(PNG);
    // Nothing to undo, so no Use whole screenshot.
    expect(hasButton('Use whole screenshot')).toBe(false);

    await openCrop();
    await drag(cropArea(), 60, 40, 160, 100);
    await cropNow();
    await openCrop();
    await click(button('Cancel'));
    expect(result()?.getAttribute('src')).toBe(CROPPED);
    expect(cropImage).toHaveBeenCalledTimes(1);
    expect(findBoard).toHaveBeenCalledTimes(2);
  });

  it('starts again from the previous selection, and drops it with Use whole screenshot', async () => {
    await drag(cropArea(), 60, 40, 160, 100);
    await cropNow();
    await openCrop();
    expect(selectionBox()).not.toBeNull();
    await click(button('Cancel'));

    await click(button('Use whole screenshot'));
    await flush();
    expect(result()?.getAttribute('src')).toBe(PNG);
    expect(hasButton('Use whole screenshot')).toBe(false);
    // The board is looked for in the whole screenshot again.
    expect(findBoard).toHaveBeenLastCalledWith(PNG);
    expect(noteText()).toBe(NOT_IN_SHOT);
  });

  it('shows that it is searching while cropping', async () => {
    cropImage.mockImplementationOnce(() => new Promise<string>(() => undefined));
    await drag(cropArea(), 60, 40, 160, 100);
    await cropNow();
    expect(container.querySelector('.capture-status')?.textContent).toBe('Finding the board…');
    expect(noteText()).toBeNull();
  });

  it('reports a crop that failed', async () => {
    cropImage.mockRejectedValueOnce(new Error('decode failed'));
    await drag(cropArea(), 60, 40, 160, 100);
    await cropNow();
    expect(container.querySelector('.capture-error')?.textContent).toBe(
      'Couldn’t crop the screenshot: decode failed',
    );
    expect(container.querySelector('.capture-status')).toBeNull();
    expect(result()?.getAttribute('src')).toBe(PNG);
  });

  it('ignores an area still being cropped once the whole screenshot is chosen', async () => {
    await drag(cropArea(), 60, 40, 160, 100);
    await cropNow();
    await openCrop();
    let finish: (url: string) => void = () => undefined;
    cropImage.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    await drag(cropArea(), 20, 30, 120, 90);
    await click(button('Crop'));
    await click(button('Use whole screenshot'));
    await act(async () => {
      finish('data:image/png;base64,second-crop');
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
    });
    expect(result()?.getAttribute('src')).toBe(PNG);
    expect(noteText()).toBe(NOT_IN_SHOT);
  });

  it('drops an area of the old screenshot once a new capture arrives', async () => {
    let finishCrop: (url: string) => void = () => undefined;
    cropImage.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          finishCrop = resolve;
        }),
    );
    await drag(cropArea(), 60, 40, 160, 100);
    // Capture tab (resolves on the next microtasks), and Crop before it arrives.
    await act(() => {
      button('Capture tab').click();
      button('Crop').click();
    });
    await flush();
    await act(async () => {
      finishCrop(CROPPED);
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
    });
    expect(result()?.getAttribute('src')).toBe(PNG);
    expect(noteText()).toBe(NOT_IN_SHOT);
  });

  it('starts over with a new capture', async () => {
    await drag(cropArea(), 60, 40, 160, 100);
    await cropNow();
    await click(button('Capture tab'));
    await flush();
    expect(container.querySelector('.crop-area')).toBeNull();
    expect(result()?.getAttribute('src')).toBe(PNG);
    expect(hasButton('Use whole screenshot')).toBe(false);
  });
});

describe('finding the board after a capture', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgo=';
  const BOARD = { x: 100, y: 50, width: 400, height: 400 };
  const status = () => container.querySelector('.capture-status')?.textContent ?? null;
  let cropImage: ReturnType<typeof vi.fn<(dataUrl: string, rect: unknown) => Promise<string>>>;

  async function renderWith(findBoard: FindBoard) {
    cropImage = vi.fn(() => Promise.resolve('data:image/png;base64,cropped'));
    await act(() => {
      render(null, container);
    });
    await act(() => {
      render(
        <App
          captureVisibleTab={() => Promise.resolve(PNG)}
          cropImage={cropImage}
          findBoard={findBoard}
          recognize={readsKings}
        />,
        container,
      );
    });
  }

  /** The shown screenshot: 1000×500 pixels. */
  async function loadImage() {
    const image = container.querySelector('.screenshot img');
    if (!image) throw new Error('No screenshot');
    Object.defineProperty(image, 'naturalWidth', { value: 1000 });
    Object.defineProperty(image, 'naturalHeight', { value: 500 });
    await act(() => {
      image.dispatchEvent(new Event('load'));
    });
  }

  it('shows the screenshot and outlines the board it finds', async () => {
    await renderWith(() => Promise.resolve(found(BOARD)));
    await click(button('Capture tab'));
    await flush();
    await loadImage();
    expect(noteText()).toBe(LOADED);
    expect(cropImage).not.toHaveBeenCalled();
    expect(container.querySelector('.screenshot img')?.getAttribute('src')).toBe(PNG);
    expect(container.querySelector('.crop-area')).toBeNull();
    expect(outline()?.style.left).toBe('10%');
    expect(outline()?.style.top).toBe('10%');
    expect(outline()?.style.width).toBe('40%');
    expect(outline()?.style.height).toBe('80%');
    expect(hasButton('Crop')).toBe(true);
    expect(hasButton('Use whole screenshot')).toBe(false);
  });

  it('says so when it finds none, with no outline', async () => {
    await renderWith(notFound);
    await click(button('Capture tab'));
    await flush();
    await loadImage();
    expect(noteText()).toBe(NOT_IN_SHOT);
    expect(outline()).toBeNull();
  });

  it('shows that it is looking for the board meanwhile', async () => {
    await renderWith(() => new Promise(() => undefined));
    await click(button('Capture tab'));
    await flush();
    expect(status()).toBe('Finding the board…');
    expect(noteText()).toBeNull();
  });

  it('treats a failure to look as not found', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await renderWith(() => Promise.reject(new Error('decode failed')));
    await click(button('Capture tab'));
    await flush();
    expect(noteText()).toBe(NOT_IN_SHOT);
    expect(error).toHaveBeenCalled();
  });

  it('ignores a board found after the screenshot was removed', async () => {
    let finish: (result: Awaited<ReturnType<FindBoard>>) => void = () => undefined;
    await renderWith(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await click(button('Capture tab'));
    await flush();
    await click(button('Remove screenshot'));
    await act(async () => {
      finish(found(BOARD));
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
    });
    expect(container.querySelector('.screenshot img, .crop-area img')).toBeNull();
    expect(status()).toBeNull();
    expect(noteText()).toBeNull();
  });

  it('ignores a board found on the previous screenshot after capturing again', async () => {
    let finish: (result: Awaited<ReturnType<FindBoard>>) => void = () => undefined;
    let calls = 0;
    await renderWith(() => {
      calls += 1;
      return calls === 1
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : notFound('');
    });
    await click(button('Capture tab'));
    await flush();
    await click(button('Capture tab'));
    await flush();
    await act(async () => {
      finish(found(BOARD));
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
    });
    expect(noteText()).toBe(NOT_IN_SHOT);
  });
});

describe('reading the pieces', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgo=';
  const BOARD = { x: 100, y: 50, width: 400, height: 400 };
  const status = () => container.querySelector('.capture-status')?.textContent ?? null;
  const findsBoard: FindBoard = () => Promise.resolve(found(BOARD));

  async function renderWith(recognize: Recognize, findBoard = findsBoard) {
    await act(() => {
      render(null, container);
    });
    await act(() => {
      render(
        <App
          createTransport={() => new FakeTransport()}
          captureVisibleTab={() => Promise.resolve(PNG)}
          cropImage={() => Promise.resolve('data:image/png;base64,cropped')}
          findBoard={findBoard}
          recognize={recognize}
        />,
        container,
      );
    });
  }

  async function capture() {
    await click(button('Capture tab'));
    await flush();
  }

  it('loads the position read into the editor, leaving the side to move to choose', async () => {
    const recognize = vi.fn(readsKings);
    await renderWith(recognize);
    await capture();
    expect(recognize).toHaveBeenCalledWith(PNG, BOARD);
    expect(noteText()).toBe(LOADED);
    expect(pieceCount()).toBe(2);
    expect(label('e1')).toBe('e1, white king');
    expect(label('e8')).toBe('e8, black king');
    await click(button('Confirm position'));
    expect(errorTexts('.confirm')).toEqual(['Choose whose turn it is (White or Black).']);
  });

  it('shows that it is reading the pieces meanwhile, with the board outlined', async () => {
    await renderWith(() => new Promise(() => undefined));
    await capture();
    expect(status()).toBe('Reading the pieces…');
    expect(noteText()).toBeNull();
    expect(pieceCount()).toBe(32);
  });

  it('says so when piece recognition isn’t installed, leaving the board alone', async () => {
    await renderWith(() => Promise.resolve({ ok: false, reason: 'no-model' }));
    await capture();
    expect(noteText()).toBe('Board found. Piece recognition isn’t installed.');
    expect(pieceCount()).toBe(32);
  });

  it('says so when the pieces couldn’t be read', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await renderWith(() => Promise.reject(new Error('session failed')));
    await capture();
    expect(noteText()).toBe('Board found, but the pieces couldn’t be read.');
    expect(error).toHaveBeenCalled();
    expect(pieceCount()).toBe(32);
  });

  it('reads it again from the other side on Flip board, until it is edited', async () => {
    // Black's pieces at the bottom of the screen; the editor has White at the bottom.
    await renderWith(() =>
      Promise.resolve({ ok: true, readings: screenReadings('3K4/8/8/8/8/8/8/3k4') }),
    );
    await capture();
    expect(label('d8')).toBe('d8, white king');

    await click(button('Flip board'));
    expect(firstSquare()).toBe('h1');
    expect(label('e1')).toBe('e1, white king');
    expect(label('e8')).toBe('e8, black king');
    expect(pieceCount()).toBe(2);

    await click(button('Flip board'));
    expect(label('d8')).toBe('d8, white king');

    // After an edit, Flip board only turns the view.
    await click(button('Clear board'));
    await click(button('Flip board'));
    expect(pieceCount()).toBe(0);
  });

  it('reads with the orientation at the time the pieces are read', async () => {
    let finish: (result: Awaited<ReturnType<Recognize>>) => void = () => undefined;
    await renderWith(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await capture();
    await click(button('Flip board'));
    await act(async () => {
      finish({ ok: true, readings: screenReadings('3K4/8/8/8/8/8/8/3k4') });
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
    });
    expect(label('e1')).toBe('e1, white king');
    expect(label('e8')).toBe('e8, black king');
  });

  it('ignores pieces read after the position was confirmed', async () => {
    let finish: (result: Awaited<ReturnType<Recognize>>) => void = () => undefined;
    await renderWith(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await capture();
    const before = pieceCount();
    await click(button('Confirm position'));
    await act(async () => {
      finish({ ok: true, readings: screenReadings(KINGS) });
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
    });
    expect(container.querySelector('.palette')).toBeNull();

    await click(button('Edit position'));
    expect(pieceCount()).toBe(before);
    expect(noteText()).toBe('Board found.');
  });

  it('ignores pieces read after the screenshot was removed', async () => {
    let finish: (result: Awaited<ReturnType<Recognize>>) => void = () => undefined;
    await renderWith(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await capture();
    await click(button('Remove screenshot'));
    await act(async () => {
      finish({ ok: true, readings: screenReadings(KINGS) });
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
    });
    expect(pieceCount()).toBe(32);
    expect(status()).toBeNull();
    expect(noteText()).toBeNull();
  });

  it('keeps edits made while the pieces were being read', async () => {
    let finish: (result: Awaited<ReturnType<Recognize>>) => void = () => undefined;
    await renderWith(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await capture();
    await click(button('Clear board'));
    await act(async () => {
      finish({ ok: true, readings: screenReadings(KINGS) });
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
    });
    expect(pieceCount()).toBe(0);
    expect(noteText()).toBe('Board found. The position was edited meanwhile, so it was kept.');
  });

  it('keeps edits made while the board was being found', async () => {
    let locate: () => void = () => undefined;
    await renderWith(
      readsKings,
      () =>
        new Promise((resolve) => {
          locate = () => {
            resolve(found(BOARD));
          };
        }),
    );
    await capture();
    await click(button('Clear board'));
    await act(async () => {
      locate();
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
    });
    expect(pieceCount()).toBe(0);
    expect(noteText()).toBe('Board found. The position was edited meanwhile, so it was kept.');
  });

  it('does not read the pieces when no board is found', async () => {
    const recognize = vi.fn(readsKings);
    await act(() => {
      render(null, container);
    });
    await act(() => {
      render(
        <App
          captureVisibleTab={() => Promise.resolve(PNG)}
          findBoard={notFound}
          recognize={recognize}
        />,
        container,
      );
    });
    await capture();
    expect(recognize).not.toHaveBeenCalled();
    expect(pieceCount()).toBe(32);
  });
});
