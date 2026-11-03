// @vitest-environment happy-dom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

const container = document.createElement('div');

beforeEach(async () => {
  document.body.append(container);
  await act(() => {
    render(<App />, container);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  render(null, container);
  container.remove();
});

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

  it('hides the confirmed FEN as soon as the board changes', async () => {
    await click(button('Confirm position'));
    expect(confirmedFen()).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    await dragTo(square('e2'), 'e4');
    expect(confirmedFen()).toBeNull();
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
