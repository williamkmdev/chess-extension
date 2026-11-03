// @vitest-environment happy-dom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setHalfmoveClock } from '../../shared/editing';
import { emptyDraft, startingPosition, type DraftPosition } from '../../shared/position';
import { PositionDetails } from './PositionDetails';

const container = document.createElement('div');

afterEach(() => {
  render(null, container);
  container.remove();
});

async function renderDetails(position: DraftPosition) {
  const onChange = vi.fn<(next: DraftPosition) => void>();
  document.body.append(container);
  await act(() => {
    render(<PositionDetails position={position} onChange={onChange} />, container);
  });
  return onChange;
}

function control(labelText: string): Element {
  const label = [...container.querySelectorAll('label')].find((l) =>
    l.textContent.includes(labelText),
  );
  const el = label?.querySelector('input, select');
  if (!el) throw new Error(`No control labeled '${labelText}'`);
  return el;
}

function input(labelText: string): HTMLInputElement {
  const el = control(labelText);
  if (!(el instanceof HTMLInputElement)) throw new Error(`'${labelText}' is not an input`);
  return el;
}

function select(labelText: string): HTMLSelectElement {
  const el = control(labelText);
  if (!(el instanceof HTMLSelectElement)) throw new Error(`'${labelText}' is not a select`);
  return el;
}

const lastChange = (onChange: ReturnType<typeof vi.fn>) => {
  const call = onChange.mock.calls.at(-1) as [DraftPosition] | undefined;
  if (!call) throw new Error('onChange was not called');
  return call[0];
};

describe('PositionDetails', () => {
  it('requires a side to move and tags defaulted fields as assumed', async () => {
    await renderDetails(emptyDraft());
    expect(container.querySelector('.required')?.textContent).toBe('required');
    // 4 castling rights + en passant + 2 counters
    expect(container.querySelectorAll('.assumed')).toHaveLength(7);
  });

  it('shows no tags for a fully stated position', async () => {
    await renderDetails(startingPosition());
    expect(container.querySelector('.required')).toBeNull();
    expect(container.querySelectorAll('.assumed')).toHaveLength(0);
    expect(input('White').checked).toBe(true);
    expect(input('Black O-O-O').checked).toBe(true);
  });

  it('sets the side to move', async () => {
    const onChange = await renderDetails(emptyDraft());
    await act(() => {
      input('Black').click();
    });
    expect(lastChange(onChange).sideToMove).toBe('b');
  });

  it('sets a single castling right as provided', async () => {
    const onChange = await renderDetails(emptyDraft());
    await act(() => {
      input('White O-O-O').click();
    });
    const next = lastChange(onChange);
    expect(next.castling.whiteQueenside).toEqual({ value: true, source: 'provided' });
    expect(next.castling.whiteKingside.source).toBe('default');
  });

  it('sets and clears the en passant square', async () => {
    const onChange = await renderDetails(emptyDraft());
    const enPassant = select('En passant');
    expect(enPassant.options).toHaveLength(17);
    await act(() => {
      enPassant.value = 'd6';
      enPassant.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(lastChange(onChange).enPassant).toEqual({ value: 'd6', source: 'provided' });
    await act(() => {
      enPassant.value = '';
      enPassant.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(lastChange(onChange).enPassant).toEqual({ value: null, source: 'provided' });
  });

  it('commits only valid counter values', async () => {
    const onChange = await renderDetails(emptyDraft());
    const halfmove = input('Halfmove clock');
    const type = async (input: HTMLInputElement, value: string) => {
      await act(() => {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    };

    await type(halfmove, '12');
    expect(lastChange(onChange).halfmoveClock).toEqual({ value: 12, source: 'provided' });

    onChange.mockClear();
    for (const bad of ['', '-1', '1.5', 'abc']) await type(halfmove, bad);
    expect(onChange).not.toHaveBeenCalled();

    const fullmove = input('Fullmove number');
    await type(fullmove, '0');
    expect(onChange).not.toHaveBeenCalled();
    await type(fullmove, '25');
    expect(lastChange(onChange).fullmoveNumber).toEqual({ value: 25, source: 'provided' });
  });

  it('snaps an invalid counter back to the stored value on blur', async () => {
    await renderDetails(setHalfmoveClock(emptyDraft(), 4));
    const halfmove = input('Halfmove clock');
    await act(() => {
      halfmove.value = '';
      halfmove.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(() => {
      halfmove.dispatchEvent(new FocusEvent('blur'));
    });
    expect(halfmove.value).toBe('4');
  });
});
